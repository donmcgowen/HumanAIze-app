/**
 * Image Content Detector
 *
 * Classifies images to route to the appropriate AI model:
 * - "label": Nutrition label, product packaging, or text-heavy document
 * - "meal": Plated food, ingredients, or meal composition
 */

import { ENV } from "./_core/env";

export type ImageClassification = "label" | "meal";

/**
 * Detect if an image is predominantly a nutrition label/text or a plate of food.
 * Uses a quick OpenAI Vision call to classify without full processing.
 */
export async function detectImageType(
  imageBase64: string,
  mimeType: string = "image/jpeg"
): Promise<ImageClassification> {
  const apiKey = ENV.forgeApiKey;
  if (!apiKey) {
    console.warn("[ImageDetector] OpenAI API key not configured, defaulting to meal");
    return "meal";
  }

  try {
    const configuredBaseUrl = (ENV.forgeApiUrl || "https://api.openai.com").replace(/\/$/, "");
    const isAzure = configuredBaseUrl.includes("openai.azure.com");
    const mediaType = mimeType === "image/jpeg" || mimeType === "image/jpg" ? "image/jpeg" : "image/png";

    const azureApiVersion = "2024-02-15-preview";
    const azureLooksLikeFullCompletionsUrl = /\/chat\/completions(\?|$)/i.test(configuredBaseUrl);
    const url = isAzure
      ? (azureLooksLikeFullCompletionsUrl
          ? (configuredBaseUrl.includes("api-version=")
              ? configuredBaseUrl
              : `${configuredBaseUrl}${configuredBaseUrl.includes("?") ? "&" : "?"}api-version=${azureApiVersion}`)
          : `${configuredBaseUrl}/openai/deployments/gpt-4o-mini/chat/completions?api-version=${azureApiVersion}`)
      : `${configuredBaseUrl}/v1/chat/completions`;

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
      body: JSON.stringify({
        ...(!isAzure ? { model: "gpt-4o-mini" } : {}),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Classify this image in ONE word only: "label" if it's a nutrition label, product packaging, barcode, or text-heavy document; "meal" if it's a plate of food or plated dish. Answer ONLY the word "label" or "meal", nothing else.`,
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mediaType};base64,${imageBase64}`,
                  detail: "low", // Low detail is sufficient for classification
                },
              },
            ],
          },
        ],
        temperature: 0,
        max_tokens: 10,
      }),
    });

    if (!response.ok) {
      console.warn(`[ImageDetector] Classification failed (${response.status}), defaulting to meal`);
      return "meal";
    }

    const data = (await response.json()) as any;
    const responseText = data?.choices?.[0]?.message?.content?.trim().toLowerCase() ?? "meal";

    // Ensure we only return valid classifications
    if (responseText.includes("label")) {
      return "label";
    }
    return "meal";
  } catch (error) {
    console.warn("[ImageDetector] Error during classification:", error instanceof Error ? error.message : error);
    return "meal"; // Default to meal on error
  }
}
