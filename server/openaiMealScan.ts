/**
 * AI Food Scanner — uses OpenAI Vision API (GPT-4o-mini) for text-heavy tasks.
 *
 * Handles nutrition label reading where OCR accuracy is critical.
 */

import { ENV } from "./_core/env";
import { MealFoodItem, MealScanResult } from "./geminiMealScan";

const OPENAI_MODEL = "gpt-4o-mini";

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

async function callOpenAIVision(
  imageBase64: string,
  mimeType: string,
  prompt: string
): Promise<any> {
  const apiKey = ENV.forgeApiKey;
  if (!apiKey) {
    throw new Error("BUILT_IN_FORGE_API_KEY is not configured on the server.");
  }

  const configuredBaseUrl = (ENV.forgeApiUrl || "https://api.openai.com").replace(/\/$/, "");
  const isAzure = configuredBaseUrl.includes("openai.azure.com");

  // Convert MIME type to OpenAI format
  const mediaType = mimeType === "image/jpeg" || mimeType === "image/jpg" ? "image/jpeg" : "image/png";

  const azureApiVersion = "2024-02-15-preview";
  const azureLooksLikeFullCompletionsUrl = /\/chat\/completions(\?|$)/i.test(configuredBaseUrl);
  const url = isAzure
    ? (azureLooksLikeFullCompletionsUrl
        ? (configuredBaseUrl.includes("api-version=")
            ? configuredBaseUrl
            : `${configuredBaseUrl}${configuredBaseUrl.includes("?") ? "&" : "?"}api-version=${azureApiVersion}`)
        : `${configuredBaseUrl}/openai/deployments/${OPENAI_MODEL}/chat/completions?api-version=${azureApiVersion}`)
    : `${configuredBaseUrl}/v1/chat/completions`;

  const requestBody: Record<string, unknown> = {
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: prompt,
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${mediaType};base64,${imageBase64}`,
              detail: "high", // "high" for text-heavy images (labels)
            },
          },
        ],
      },
    ],
    temperature: 0.1,
    max_tokens: 4096,
    response_format: { type: "json_object" },
  };

  if (!isAzure) {
    requestBody.model = OPENAI_MODEL;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (isAzure) {
    headers["api-key"] = apiKey;
  } else {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `OpenAI Vision API error: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  const data = (await response.json()) as any;
  const responseText = data?.choices?.[0]?.message?.content ?? "";

  if (!responseText.trim()) {
    throw new Error("No response from OpenAI Vision API.");
  }

  // Strip markdown code fences and parse JSON
  const cleaned = responseText
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/gi, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    console.error("[OpenAIMealScan] Raw response that failed to parse:", responseText.slice(0, 500));
    throw new Error("Could not parse OpenAI Vision response as JSON.");
  }
}

/**
 * Scan a product label / nutrition facts panel using OpenAI Vision.
 * Returns a single food item with per-serving macros.
 */
export async function scanProductLabelWithOpenAI(
  imageBase64: string,
  mimeType: string = "image/jpeg"
): Promise<MealScanResult> {
  const parsed = await callOpenAIVision(imageBase64, mimeType, PRODUCT_PROMPT);

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
