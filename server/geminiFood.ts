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
 * Classify a food query into one of three tiers:
 * - "whole_food": plain produce, meat, grain, dairy (e.g. "strawberries", "fresh strawberries", "chicken breast", "brown rice")
 * - "branded": a specific brand name is the first word (e.g. "Muscle Milk", "Quest Bar", "Chobani")
 * - "generic_packaged": a generic packaged food that has well-known brands (e.g. "chocolate milk", "greek yogurt", "protein powder")
 */
function classifyFoodQuery(query: string): { type: "whole_food" | "branded" | "generic_packaged"; coreFood: string } {
  const normalized = query.trim().toLowerCase();
  const words = normalized.split(/\s+/).filter(w => w.length > 0);
  const firstWord = words[0] ?? "";

  // Whole food base terms — these are raw/fresh/plain ingredients
  const wholeFoodTerms = new Set([
    // Fruits
    "strawberry","strawberries","blueberry","blueberries","raspberry","raspberries","blackberry","blackberries",
    "banana","bananas","apple","apples","orange","oranges","grape","grapes","watermelon","cantaloupe","melon",
    "peach","peaches","plum","plums","pear","pears","cherry","cherries","mango","mangoes","pineapple",
    "kiwi","kiwis","papaya","fig","figs","lemon","lemons","lime","limes","grapefruit","pomegranate",
    "avocado","avocados","coconut","dates","prunes","raisins","cranberries","cranberry",
    // Vegetables
    "broccoli","spinach","kale","lettuce","cabbage","carrot","carrots","celery","cucumber","cucumbers",
    "tomato","tomatoes","potato","potatoes","sweet potato","sweet potatoes","onion","onions","garlic",
    "bell pepper","bell peppers","pepper","peppers","zucchini","squash","pumpkin","corn","peas",
    "green beans","asparagus","artichoke","beet","beets","radish","turnip","cauliflower","brussels sprouts",
    "mushroom","mushrooms","eggplant","leek","leeks","arugula","chard","collard greens","bok choy",
    // Proteins (plain/raw)
    "chicken","chicken breast","chicken thigh","chicken leg","chicken wing","ground chicken",
    "beef","ground beef","steak","sirloin","ribeye","brisket","chuck","flank steak",
    "pork","pork chop","pork loin","bacon","ham","sausage","ground pork",
    "turkey","ground turkey","turkey breast",
    "salmon","tuna","tilapia","cod","shrimp","lobster","crab","scallops","halibut","mahi mahi","sardines","anchovies","trout",
    "lamb","venison","bison","duck","veal",
    "egg","eggs","egg white","egg whites","egg yolk",
    // Dairy (plain)
    "milk","whole milk","skim milk","2% milk","almond milk","oat milk","soy milk","coconut milk",
    "cheese","cheddar","mozzarella","parmesan","swiss cheese","feta","brie","gouda","ricotta","cottage cheese",
    "butter","ghee","cream","heavy cream","sour cream","cream cheese","whipped cream",
    "yogurt","plain yogurt","greek yogurt",
    // Grains (plain)
    "rice","white rice","brown rice","jasmine rice","basmati rice","wild rice",
    "oats","oatmeal","rolled oats","steel cut oats","instant oats",
    "pasta","spaghetti","penne","fettuccine","linguine","macaroni","noodles",
    "bread","white bread","wheat bread","sourdough","bagel","pita","tortilla","wrap",
    "quinoa","barley","farro","bulgur","couscous","millet","buckwheat","amaranth",
    "flour","wheat flour","all purpose flour","whole wheat flour","cornmeal","cornstarch",
    // Legumes
    "lentils","chickpeas","black beans","kidney beans","pinto beans","navy beans","soybeans","edamame",
    "tofu","tempeh","seitan",
    // Nuts & seeds
    "almonds","walnuts","cashews","peanuts","pecans","pistachios","macadamia","hazelnuts","brazil nuts",
    "sunflower seeds","pumpkin seeds","chia seeds","flaxseed","hemp seeds","sesame seeds",
    "peanut butter","almond butter","tahini",
    // Oils & fats
    "olive oil","coconut oil","vegetable oil","canola oil","avocado oil",
    // Other whole foods
    "honey","maple syrup","sugar","brown sugar","salt","pepper","cinnamon",
    "coffee","tea","water",
  ]);

  // Descriptors that, when combined with a whole food term, still mean a whole food
  const wholeFoodDescriptors = new Set([
    "fresh","raw","frozen","dried","organic","wild","grass-fed","free-range","plain","whole",
    "cooked","baked","grilled","steamed","boiled","roasted","sauteed","fried","broiled",
    "sliced","diced","chopped","mashed","pureed","canned","unsalted","salted","unsweetened",
    "boneless","skinless","lean","extra lean","large","medium","small","ripe",
  ]);

  // Check if this is a whole food query: all meaningful words are either whole food terms or descriptors
  const coreWords = words.filter(w => !wholeFoodDescriptors.has(w));
  const corePhrase = coreWords.join(" ");
  const isWholeFood = wholeFoodTerms.has(corePhrase) || wholeFoodTerms.has(normalized) ||
    (coreWords.length === 1 && wholeFoodTerms.has(coreWords[0])) ||
    (coreWords.length === 2 && wholeFoodTerms.has(coreWords.join(" ")));

  if (isWholeFood) {
    return { type: "whole_food", coreFood: corePhrase || normalized };
  }

  // Branded query: first word is not a generic/descriptor term and query has 2+ words
  const allGenericWords = new Set([...Array.from(wholeFoodTerms), ...Array.from(wholeFoodDescriptors),
    "protein","bar","shake","powder","supplement","drink","snack","meal","food","mix","blend",
    "low","high","fat","calorie","calories","carb","carbs","sugar","fiber","sodium",
    "chocolate","vanilla","strawberry","berry","fruit","nut","seed","grain","dairy",
  ]);
  const isBrandedQuery = words.length >= 2 && !allGenericWords.has(firstWord) && /^[A-Z]/.test(query.trim().split(/\s+/)[0]);

  if (isBrandedQuery) {
    return { type: "branded", coreFood: query };
  }

  return { type: "generic_packaged", coreFood: query };
}

/**
 * Use Gemini with Google Search grounding to find real product nutrition data.
 * Calls the Gemini API directly with the googleSearch tool enabled.
 */
async function searchFoodWithGeminiGrounded(query: string, apiKey: string): Promise<FoodVariation[]> {
  const GEMINI_MODEL = "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const { type, coreFood } = classifyFoodQuery(query);

  let searchInstruction: string;
  let nameInstruction: string;

  if (type === "whole_food") {
    searchInstruction = `This is a WHOLE FOOD / PRODUCE query for "${query}". Search USDA FoodData Central and nutrition databases for the plain, unprocessed food item.
CRITICAL: Return ONLY the plain food itself (e.g. "Strawberries, raw", "Strawberries, fresh", "Strawberries, frozen unsweetened"). 
Do NOT return any branded products, recipes, meals, or products that merely CONTAIN ${coreFood}.
Do NOT return yogurt parfaits, cheesecakes, smoothies, or any prepared food — ONLY the raw/fresh/frozen/dried fruit/vegetable/ingredient itself.
Return 3-5 variations of the plain food (raw, frozen, dried, cooked if applicable).`;
    nameInstruction = `- name: plain food name with preparation method (e.g. "Strawberries, raw", "Strawberries, frozen, unsweetened")
- description: "USDA" or "Whole food" or preparation method
- NEVER include brand names for whole food results`;
  } else if (type === "branded") {
    const brandName = query.trim().split(/\s+/)[0];
    searchInstruction = `CRITICAL: The query "${query}" is a specific brand. You MUST return ONLY products from the "${brandName}" brand.
Do NOT return products from any other brand. If you cannot find "${brandName}" products, return an empty foods array.`;
    nameInstruction = `- name: exact product name including brand and flavor/variety
- description: brand name`;
  } else {
    // generic_packaged
    searchInstruction = `This is a GENERIC PACKAGED FOOD query. Return the TOP 5 most popular and widely-sold consumer brands for "${query}" in the United States.
Each result must include the brand name in the "name" field (e.g. "Chobani Plain Greek Yogurt", "Fage Total 0% Greek Yogurt"). Sort by brand popularity/market share.`;
    nameInstruction = `- name: exact product name including brand and flavor/variety (ALWAYS include brand name)
- description: brand name`;
  }

  const prompt = `You are a nutrition database expert. Use Google Search to look up nutrition facts for: "${query}"

${searchInstruction}

Return a JSON object with a "foods" array of up to 8 matching items.

Each item must have:
${nameInstruction}
- caloriesPer100g: calories per 100 grams (convert from label if needed)
- proteinPer100g: protein grams per 100g
- carbsPer100g: carbohydrates grams per 100g  
- fatPer100g: fat grams per 100g
- servingSize: standard serving size (e.g. "1 cup (152g)", "100g", "1 medium (123g)")

IMPORTANT:
- All macro values MUST be per 100g (normalize from the label serving size)
- Use REAL nutrition data from USDA or product labels, not estimates
- Return ONLY valid JSON, no markdown

Example for whole food:
{
  "foods": [
    {
      "name": "Strawberries, raw",
      "description": "USDA",
      "caloriesPer100g": 32,
      "proteinPer100g": 0.7,
      "carbsPer100g": 7.7,
      "fatPer100g": 0.3,
      "servingSize": "1 cup (152g)"
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

  // For whole food queries: filter out any branded/prepared products that slipped through
  let results = foods
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
    .filter(f => f.caloriesPer100g > 0 || f.proteinPer100g > 0);

  // For whole food queries, also clear the cache so stale branded results don't persist
  if (type === "whole_food") {
    // Sort: plain/raw first, then frozen, then others
    results = results.sort((a, b) => {
      const aRaw = /raw|fresh/i.test(a.name) ? 0 : /frozen/i.test(a.name) ? 1 : 2;
      const bRaw = /raw|fresh/i.test(b.name) ? 0 : /frozen/i.test(b.name) ? 1 : 2;
      return aRaw - bRaw;
    });
  }

  return results.slice(0, 8);
}

/**
 * Fallback: use the standard LLM (no grounding) for food nutrition lookup.
 * Uses training data only — less accurate for very new or niche products.
 */
async function searchFoodWithLLM(query: string): Promise<FoodVariation[]> {
  const { type, coreFood } = classifyFoodQuery(query);

  const wholeFoodRule = type === "whole_food"
    ? `CRITICAL: The query "${query}" is a WHOLE FOOD. Return ONLY the plain food itself (raw, frozen, dried, cooked variations).
Do NOT return any branded products, recipes, or prepared foods that merely contain ${coreFood}.
Return USDA-style entries like "Strawberries, raw", "Strawberries, frozen, unsweetened".`
    : type === "branded"
    ? `CRITICAL: Return ONLY products from the "${query.trim().split(/\s+/)[0]}" brand.`
    : `Return the TOP 5 most popular consumer brands for "${query}". Include brand name in each result.`;

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

${wholeFoodRule}

If the query is a BRANDED or PACKAGED product (e.g. "Muscle Milk", "Quest Bar", "Kind Bar", "Clif Bar", "Gatorade", "Premier Protein", etc.):
- Return the actual product variants (flavors, sizes, formulas) with real nutrition facts from the product label
- Include the exact brand name and flavor in the "name" field
- Use accurate macros from the real product — do NOT make up generic values
- Include the serving size from the product label in the "servingSize" field

If the query is a GENERIC whole food (e.g. "chicken", "rice", "broccoli", "strawberries"):
- Return variations by preparation method (raw, cooked, frozen, dried) and cuts/types
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
