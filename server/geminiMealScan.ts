/**
 * AI Food Scanner — uses invokeLLM (OpenAI-compatible endpoint) for vision tasks.
 *
 * Handles two scan modes:
 *  - "product": Reads a nutrition label / product box → returns single food item with per-serving macros
 *  - "meal":    Analyzes a plate of food → returns multiple food items with individual macros
 */

import { invokeLLM } from "./_core/llm";

export interface MealFoodItem {
  name: string;
  portionSize: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar: number;
}

export interface MealScanResult {
  items: MealFoodItem[];
  totals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    sugar: number;
  };
  mealName: string;
  description: string;
}

const PRODUCT_PROMPT = `You are a nutrition expert reading a food product label or nutrition facts panel.

Extract the following from the visible nutrition label or product packaging:
1. Product name (from the front of the package if visible, otherwise infer from label)
2. Serving size (e.g. "1 cup", "3 oz", "1 scoop (30g)", "2 tbsp")
3. Per-serving macros: Calories, Protein (g), Total Carbohydrates (g), Total Fat (g), Total Sugars (g)

If you see a full nutrition facts panel, read the exact values.
If you only see the front of the package, use the values shown (e.g. "10g protein per serving" means protein=10).

Return ONLY valid JSON with no markdown fences:
{
  "productName": "<string>",
  "servingSize": "<string>",
  "calories": <integer>,
  "protein": <integer>,
  "carbs": <integer>,
  "fat": <integer>,
  "sugar": <integer>,
  "description": "<one sentence about what the product is>"
}`;

const MEAL_PROMPT = `You are a nutrition expert analyzing a photo of a meal or plate of food.

Identify every distinct food item visible. For each item estimate:
- Name (specific: "grilled chicken breast" not just "chicken")
- Portion size (common measures: oz, cup, tbsp, piece, slice, etc.)
- Calories (kcal), Protein (g), Carbs (g), Fat (g), Sugar (g) — all whole numbers

Also provide:
- A short meal name (e.g. "Grilled Chicken with Rice and Broccoli")
- A 1-sentence description of what you see

Return ONLY valid JSON with no markdown fences:
{
  "mealName": "<string>",
  "description": "<string>",
  "items": [
    {
      "name": "<string>",
      "portionSize": "<string>",
      "calories": <integer>,
      "protein": <integer>,
      "carbs": <integer>,
      "fat": <integer>,
      "sugar": <integer>
    }
  ]
}

Be realistic with portion sizes. Always return valid JSON.`;

async function callVisionLLM(
  imageBase64: string,
  mimeType: string,
  prompt: string
): Promise<any> {
  const dataUrl = `data:${mimeType};base64,${imageBase64}`;

  const result = await invokeLLM({
    messages: [
      {
        role: "user" as const,
        content: [
          { type: "text" as const, text: prompt },
          { type: "image_url" as const, image_url: { url: dataUrl, detail: "high" as const } },
        ],
      },
    ],
  });

  const responseText: string =
    result?.choices?.[0]?.message?.content ?? "";

  if (!responseText) throw new Error("No response from vision LLM.");

  const cleaned = responseText
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/gi, "")
    .trim();

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Could not parse LLM response as JSON.");

  return JSON.parse(jsonMatch[0]);
}

/**
 * Scan a product label / nutrition facts panel.
 * Returns a single food item with per-serving macros.
 */
export async function scanProductLabel(
  imageBase64: string,
  mimeType: string = "image/jpeg"
): Promise<MealScanResult> {
  const parsed = await callVisionLLM(imageBase64, mimeType, PRODUCT_PROMPT);

  const item: MealFoodItem = {
    name: String(parsed.productName ?? "Scanned Product"),
    portionSize: String(parsed.servingSize ?? "1 serving"),
    calories: Math.round(Number(parsed.calories) || 0),
    protein: Math.round(Number(parsed.protein) || 0),
    carbs: Math.round(Number(parsed.carbs) || 0),
    fat: Math.round(Number(parsed.fat) || 0),
    sugar: Math.round(Number(parsed.sugar) || 0),
  };

  return {
    items: [item],
    totals: {
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      sugar: item.sugar,
    },
    mealName: item.name,
    description: String(parsed.description ?? ""),
  };
}

/**
 * Analyze a meal photo — identify all food items and estimate macros.
 */
export async function analyzeMealPhotoWithGemini(
  imageBase64: string,
  mimeType: string = "image/jpeg"
): Promise<MealScanResult> {
  const parsed = await callVisionLLM(imageBase64, mimeType, MEAL_PROMPT);

  const items: MealFoodItem[] = (parsed.items ?? []).map((item: any) => ({
    name: String(item.name ?? "Unknown food"),
    portionSize: String(item.portionSize ?? "1 serving"),
    calories: Math.round(Number(item.calories) || 0),
    protein: Math.round(Number(item.protein) || 0),
    carbs: Math.round(Number(item.carbs) || 0),
    fat: Math.round(Number(item.fat) || 0),
    sugar: Math.round(Number(item.sugar) || 0),
  }));

  const totals = items.reduce(
    (acc, item) => ({
      calories: acc.calories + item.calories,
      protein: acc.protein + item.protein,
      carbs: acc.carbs + item.carbs,
      fat: acc.fat + item.fat,
      sugar: acc.sugar + item.sugar,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0 }
  );

  return {
    items,
    totals,
    mealName: String(parsed.mealName ?? "Scanned Meal"),
    description: String(parsed.description ?? ""),
  };
}
