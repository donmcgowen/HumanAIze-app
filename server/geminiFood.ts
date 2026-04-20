import { invokeLLM } from "./_core/llm";
import { ENV } from "./_core/env";

export interface FoodVariation {
  name: string;
  description: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  servingSize?: string;
}

/**
 * Search for food nutrition facts using Gemini with Google Search grounding.
 * This allows Gemini to look up real product pages, nutrition databases, and
 * manufacturer websites to find accurate nutrition data for branded products
 * that may not be in USDA or Open Food Facts.
 */
export async function searchFoodWithGemini(query: string): Promise<FoodVariation[]> {
  // Try Google Search grounded Gemini first (most accurate for branded products)
  const geminiKey = ENV.geminiApiKey;
  if (geminiKey) {
    try {
      const results = await searchFoodWithGeminiGrounded(query, geminiKey);
      if (results.length > 0) return results;
    } catch (err) {
      console.warn("[GeminiFood] Grounded search failed, falling back to LLM-only:", err);
    }
  }

  // Fallback: use the standard LLM invocation (no grounding, uses training data)
  return searchFoodWithLLM(query);
}

/**
 * Use Gemini with Google Search grounding to find real product nutrition data.
 * Calls the Gemini API directly with the googleSearch tool enabled.
 */
async function searchFoodWithGeminiGrounded(query: string, apiKey: string): Promise<FoodVariation[]> {
  const GEMINI_MODEL = "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const prompt = `You are a nutrition database expert. Use Google Search to look up nutrition facts for: "${query}"

Search for official product pages, nutrition labels, and trusted nutrition databases.

Return a JSON object with a "foods" array of up to 8 matching products. Prioritize:
1. The most popular and widely-sold consumer brands (e.g. for "almond milk" return Almond Breeze, Silk, Califia Farms, Oatly, etc.)
2. Multiple varieties/flavors of the same brand if relevant (Original, Unsweetened, Vanilla, etc.)
3. Exact product matches if a specific brand is named in the query

Each item must have:
- name: exact product name including brand and flavor/variety
- description: brand name or brief description
- caloriesPer100g: calories per 100 grams (convert from label if needed)
- proteinPer100g: protein grams per 100g
- carbsPer100g: carbohydrates grams per 100g  
- fatPer100g: fat grams per 100g
- servingSize: the serving size from the label (e.g. "55g", "1 cup (240ml)", "2 scoops (82g)")

IMPORTANT:
- All macro values MUST be per 100g (normalize from the label serving size)
- Use REAL nutrition data from the product label, not estimates
- Return ONLY valid JSON, no markdown

Example format:
{
  "foods": [
    {
      "name": "Almond Breeze Almondmilk Original",
      "description": "Blue Diamond Growers",
      "caloriesPer100g": 17,
      "proteinPer100g": 0.4,
      "carbsPer100g": 1.7,
      "fatPer100g": 1.0,
      "servingSize": "1 cup (240ml)"
    }
  ]
}`;

  const requestBody = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    tools: [{ googleSearch: {} }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini grounded search error: ${response.status} – ${errorText.slice(0, 200)}`);
  }

  const data = await response.json() as any;
  const responseText: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  if (!responseText) {
    throw new Error("Empty response from Gemini grounded search");
  }

  let parsed: any;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error("Could not parse JSON from Gemini grounded response");
    }
  }

  const foods: FoodVariation[] = Array.isArray(parsed) ? parsed : parsed?.foods;
  if (!Array.isArray(foods)) throw new Error("Response is not an array");

  // Validate and sanitize each food entry
  return foods
    .filter(f => f && typeof f.name === "string" && f.name.trim())
    .map(f => ({
      name: String(f.name).trim(),
      description: String(f.description || "").trim(),
      caloriesPer100g: Math.max(0, Number(f.caloriesPer100g) || 0),
      proteinPer100g: Math.max(0, Number(f.proteinPer100g) || 0),
      carbsPer100g: Math.max(0, Number(f.carbsPer100g) || 0),
      fatPer100g: Math.max(0, Number(f.fatPer100g) || 0),
      servingSize: f.servingSize ? String(f.servingSize).trim() : undefined,
    }))
    .filter(f => f.caloriesPer100g > 0 || f.proteinPer100g > 0)
    .slice(0, 8);
}

/**
 * Fallback: use the standard LLM (no grounding) for food nutrition lookup.
 * Uses training data only — less accurate for very new or niche products.
 */
async function searchFoodWithLLM(query: string): Promise<FoodVariation[]> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a nutrition database expert with knowledge of branded food products, supplements, and whole foods. When given a food name or product name, return a JSON object with a "foods" array of up to 10 relevant results.

Format:
{
  "foods": [
    {
      "name": "Food Name",
      "description": "Brief description of the food",
      "caloriesPer100g": 165,
      "proteinPer100g": 31,
      "carbsPer100g": 0,
      "fatPer100g": 3.6,
      "servingSize": "100g"
    }
  ]
}

Rules:
- Return ONLY valid JSON, no markdown or extra text
- All nutritional values must be per 100g
- Calories should match: (protein*4 + carbs*4 + fat*9) approximately

If the query is a BRANDED or PACKAGED product (e.g. "Muscle Milk", "Quest Bar", "Kind Bar", "Clif Bar", "Gatorade", "Premier Protein", etc.):
- Return the actual product variants (flavors, sizes, formulas) with real nutrition facts from the product label
- Include the exact brand name and flavor in the "name" field
- Use accurate macros from the real product — do NOT make up generic values
- Include the serving size from the product label in the "servingSize" field

If the query is a GENERIC whole food (e.g. "chicken", "rice", "broccoli"):
- Return variations by cooking method (grilled, baked, raw, fried) and cuts/types
- Return up to 10 items`,
        },
        {
          role: "user",
          content: `Look up nutrition facts for: "${query}"`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "food_variations",
          strict: true,
          schema: {
            type: "object",
            properties: {
              foods: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    description: { type: "string" },
                    caloriesPer100g: { type: "number" },
                    proteinPer100g: { type: "number" },
                    carbsPer100g: { type: "number" },
                    fatPer100g: { type: "number" },
                    servingSize: { type: "string" },
                  },
                  required: ["name", "description", "caloriesPer100g", "proteinPer100g", "carbsPer100g", "fatPer100g", "servingSize"],
                  additionalProperties: false,
                },
              },
            },
            required: ["foods"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0].message.content;
    if (!content) throw new Error("No content in response");

    let contentStr = typeof content === "string" ? content : "";
    if (Array.isArray(content)) {
      contentStr = content
        .filter((c: any) => "text" in c)
        .map((c: any) => c.text)
        .join("");
    }

    let parsed: any;
    try {
      parsed = JSON.parse(contentStr);
    } catch {
      const jsonMatch = contentStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Could not parse food data from response");
      }
    }

    const foods: FoodVariation[] = Array.isArray(parsed) ? parsed : parsed?.foods;
    if (!Array.isArray(foods)) throw new Error("Response is not an array");

    return foods.slice(0, 10);
  } catch (error) {
    console.error("Error searching food with Gemini LLM:", error);
    throw new Error(`Failed to search food: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

// Unit conversion map to grams (approximate, per 1 unit)
const UNIT_TO_GRAMS: Record<string, number> = {
  g: 1,
  oz: 28.35,
  ml: 1,           // water/liquid density ~1g/ml
  "fl oz": 29.57,  // fluid ounce
  cup: 240,         // 1 cup = 240ml/g
  tbsp: 15,         // 1 tablespoon = 15ml
  tsp: 5,           // 1 teaspoon = 5ml
  scoop: 30,        // default scoop ~30g (overridden by servingWeightG when available)
  slice: 28,        // typical bread slice ~28g
  piece: 50,        // generic piece ~50g
  egg: 50,          // large egg ~50g
  serving: 100,     // generic serving (overridden by servingWeightG when available)
};

export function calculateMacrosForServing(
  food: FoodVariation,
  amount: number,
  unit: string,
  servingWeightG?: number  // actual gram weight of 1 scoop/serving (from product label)
): {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
} {
  // For scoop/serving units: use the actual product serving weight if provided
  let conversionFactor: number;
  if ((unit === "scoop" || unit === "serving") && servingWeightG && servingWeightG > 0) {
    conversionFactor = servingWeightG;
  } else {
    conversionFactor = UNIT_TO_GRAMS[unit] ?? 1;
  }
  const grams = amount * conversionFactor;

  // Calculate macros based on per 100g values
  const multiplier = grams / 100;

  return {
    calories: Math.round(food.caloriesPer100g * multiplier),
    protein: Math.round(food.proteinPer100g * multiplier * 10) / 10,
    carbs: Math.round(food.carbsPer100g * multiplier * 10) / 10,
    fat: Math.round(food.fatPer100g * multiplier * 10) / 10,
  };
}
