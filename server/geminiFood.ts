import { invokeLLM } from "./_core/llm";

export interface FoodVariation {
  name: string;
  description: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
}

export async function searchFoodWithGemini(query: string): Promise<FoodVariation[]> {
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
      "fatPer100g": 3.6
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
                  },
                  required: ["name", "description", "caloriesPer100g", "proteinPer100g", "carbsPer100g", "fatPer100g"],
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
    console.error("Error searching food with Gemini:", error);
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
  scoop: 30,        // default scoop ~30g (overridden by serving size when available)
  slice: 28,        // typical bread slice ~28g
  piece: 50,        // generic piece ~50g
  egg: 50,          // large egg ~50g
  serving: 100,     // generic serving
};

export function calculateMacrosForServing(
  food: FoodVariation,
  amount: number,
  unit: string
): {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
} {
  // Convert unit to grams
  const conversionFactor = UNIT_TO_GRAMS[unit] ?? 1;
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
