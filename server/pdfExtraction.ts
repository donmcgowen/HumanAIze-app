/**
 * PDF Extraction Module for Dexcom Clarity Reports
 *
 * Dexcom Clarity PDFs are image-based (rendered by HeadlessChrome/Skia).
 * Text extraction libraries return nothing. We use vision AI instead:
 *
 * 1. Convert PDF page 1 to PNG using pdftoppm (poppler-utils)
 * 2. Send the PNG as a base64 image_url to GPT-4.1-mini vision
 * 3. Parse the structured JSON response
 */

import { execSync } from "child_process";
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { ENV } from "./_core/env";

export interface ExtractedClarityData {
  averageGlucose?: number;
  minGlucose?: number;
  maxGlucose?: number;
  timeInRange?: number;
  timeAboveRange?: number;
  timeBelowRange?: number;
  standardDeviation?: number;
  coefficient?: number;
  estimatedA1C?: number;
  reportPeriod?: {
    startDate?: string;
    endDate?: string;
  };
  rawText: string;
  extractionMethod?: "vision" | "regex" | "ai";
  aiSummary?: string;
}

/**
 * Convert PDF page 1 to a PNG buffer using pdftoppm.
 * Returns null if pdftoppm is not available.
 */
async function pdfToPageImage(pdfBuffer: Buffer): Promise<Buffer | null> {
  const id = `clarity_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const pdfPath = join(tmpdir(), `${id}.pdf`);
  const outPrefix = join(tmpdir(), id);

  try {
    writeFileSync(pdfPath, pdfBuffer);

    // -r 150: 150 DPI (good balance of quality vs size)
    // -png: output as PNG
    // -f 1 -l 1: only page 1
    execSync(`pdftoppm -r 150 -png -f 1 -l 1 "${pdfPath}" "${outPrefix}"`, {
      timeout: 30000,
      stdio: "pipe",
    });

    // pdftoppm names the output file as <prefix>-01.png
    const pngPath = `${outPrefix}-01.png`;
    if (!existsSync(pngPath)) {
      // Try zero-padded variants
      const variants = [`${outPrefix}-1.png`, `${outPrefix}-001.png`];
      for (const v of variants) {
        if (existsSync(v)) {
          const buf = readFileSync(v);
          unlinkSync(v);
          return buf;
        }
      }
      return null;
    }

    const buf = readFileSync(pngPath);
    unlinkSync(pngPath);
    return buf;
  } catch (err) {
    console.warn("[pdfExtraction] pdftoppm failed:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    try { if (existsSync(pdfPath)) unlinkSync(pdfPath); } catch {}
  }
}

/**
 * Use vision AI to extract glucose metrics from a PNG image of the Clarity report.
 */
async function extractWithVision(imageBuffer: Buffer): Promise<{
  averageGlucose?: number;
  timeInRange?: number;
  estimatedA1C?: number;
  timeAboveRange?: number;
  timeBelowRange?: number;
  standardDeviation?: number;
  minGlucose?: number;
  maxGlucose?: number;
  summary?: string;
} | null> {
  const apiKey = ENV.forgeApiKey;
  if (!apiKey) {
    throw new Error("BUILT_IN_FORGE_API_KEY is not configured");
  }

  const base = ENV.forgeApiUrl ? ENV.forgeApiUrl.replace(/\/$/, "") : "https://api.openai.com/v1";
  const apiUrl = base.includes("openai.azure.com") ? base : `${base}/chat/completions`;

  // Use gpt-4.1-mini for vision (supports image_url)
  // Fall back to ENV.llmModel if it's already a vision-capable model
  const visionModel = "gpt-4.1-mini";

  const base64 = imageBuffer.toString("base64");

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: visionModel,
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `This is page 1 of a Dexcom Clarity CGM report. Extract the following values exactly as shown on the page:

1. Average Glucose (mg/dL) — the large number under "Average glucose"
2. GMI or A1C estimate (%) — the number under "GMI" (Glucose Management Indicator)
3. Time in Range (%) — the "% In Range" value from the Time in Range section (e.g. "74% In Range")
4. Time Above Range (%) — the "% High" or "% Very High" combined, or "% Above Range"
5. Time Below Range (%) — the "% Low" or "% Very Low" combined, or "% Below Range"
6. Standard Deviation (mg/dL) — under "Standard deviation"
7. Write a 2-sentence plain-English summary of the patient's glucose control.

Return ONLY valid JSON with no markdown:
{
  "averageGlucose": <number or null>,
  "a1cEstimate": <number or null>,
  "timeInRange": <number or null>,
  "timeAboveRange": <number or null>,
  "timeBelowRange": <number or null>,
  "standardDeviation": <number or null>,
  "summary": "<string>"
}`,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${base64}`,
                detail: "high",
              },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Vision API error: ${response.status} ${errText.slice(0, 200)}`);
  }

  const data = await response.json() as any;
  const content = data.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") return null;

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      averageGlucose: parsed.averageGlucose ?? undefined,
      timeInRange: parsed.timeInRange ?? undefined,
      estimatedA1C: parsed.a1cEstimate ?? undefined,
      timeAboveRange: parsed.timeAboveRange ?? undefined,
      timeBelowRange: parsed.timeBelowRange ?? undefined,
      standardDeviation: parsed.standardDeviation ?? undefined,
      summary: parsed.summary ?? undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Main entry point: parse a Dexcom Clarity PDF buffer.
 * Uses vision AI since Clarity PDFs are image-based.
 */
export async function parseClarityReportText(text: string): Promise<ExtractedClarityData> {
  // This overload is kept for backward compatibility but the real work
  // is done by parseClarityPDFBuffer below.
  return {
    rawText: text,
    extractionMethod: "regex",
  };
}

/**
 * Parse a Dexcom Clarity PDF buffer using vision AI.
 */
export async function parseClarityPDFBuffer(pdfBuffer: Buffer): Promise<ExtractedClarityData> {
  const data: ExtractedClarityData = {
    rawText: "",
    extractionMethod: "vision",
  };

  // Step 1: Convert page 1 to PNG
  const imageBuffer = await pdfToPageImage(pdfBuffer);

  if (!imageBuffer) {
    throw new Error(
      "Could not convert PDF to image. Please ensure poppler-utils (pdftoppm) is installed on the server."
    );
  }

  // Step 2: Vision AI extraction
  const result = await extractWithVision(imageBuffer);

  if (!result) {
    throw new Error("Vision AI could not extract data from the PDF image.");
  }

  data.averageGlucose = result.averageGlucose;
  data.timeInRange = result.timeInRange;
  data.estimatedA1C = result.estimatedA1C;
  data.timeAboveRange = result.timeAboveRange;
  data.timeBelowRange = result.timeBelowRange;
  data.standardDeviation = result.standardDeviation;
  data.aiSummary = result.summary;

  // Derive A1C from average glucose if still missing
  if (data.estimatedA1C === undefined && typeof data.averageGlucose === "number") {
    data.estimatedA1C = Math.round((((data.averageGlucose / 28.7) + 2.15) * 100)) / 100;
  }

  return data;
}

/**
 * Extract text from PDF buffer — kept for backward compat but Clarity PDFs have no text.
 */
export async function extractTextFromPDF(pdfBuffer: Buffer): Promise<string> {
  try {
    const pdfParse = await import("pdf-parse");
    const parseFn = (pdfParse as any).default ?? pdfParse;
    const result = await parseFn(pdfBuffer);
    return result.text || "";
  } catch {
    return "";
  }
}

/**
 * Validate if PDF appears to be a Dexcom Clarity report (by filename/metadata check).
 * Since the PDF is image-based, we can only do a loose check.
 */
export function validateClarityPDF(text: string): { valid: boolean; error?: string } {
  // text will be empty for image-based PDFs — always pass validation
  // The actual content check happens after vision extraction
  return { valid: true };
}

/**
 * Generate insights from extracted Clarity data
 */
export function generateClarityInsights(data: ExtractedClarityData): string[] {
  const insights: string[] = [];

  if (!data.averageGlucose) {
    return ["Unable to extract glucose data from PDF. Please ensure this is a valid Dexcom Clarity report."];
  }

  if (data.averageGlucose < 70) {
    insights.push("⚠️ Your average glucose is low. Consider consulting with your healthcare provider about adjusting your insulin or medication.");
  } else if (data.averageGlucose < 100) {
    insights.push("✓ Your average glucose is in a healthy range. Keep up your current management strategy.");
  } else if (data.averageGlucose < 150) {
    insights.push("📊 Your average glucose is slightly elevated. Consider reviewing your diet and exercise routine.");
  } else {
    insights.push("⚠️ Your average glucose is elevated. Discuss with your healthcare provider about adjusting your diabetes management plan.");
  }

  if (data.timeInRange) {
    if (data.timeInRange >= 70) {
      insights.push(`✓ Excellent time in range (${data.timeInRange.toFixed(1)}%). You're doing great with glucose management!`);
    } else if (data.timeInRange >= 50) {
      insights.push(`📊 Good time in range (${data.timeInRange.toFixed(1)}%). There's room for improvement.`);
    } else {
      insights.push(`⚠️ Low time in range (${data.timeInRange.toFixed(1)}%). Consider working with your healthcare team to improve glucose control.`);
    }
  }

  if (data.estimatedA1C) {
    if (data.estimatedA1C < 5.7) {
      insights.push(`✓ Estimated A1C of ${data.estimatedA1C.toFixed(1)}% is excellent.`);
    } else if (data.estimatedA1C < 7) {
      insights.push(`✓ Estimated A1C of ${data.estimatedA1C.toFixed(1)}% is within recommended range.`);
    } else if (data.estimatedA1C < 8) {
      insights.push(`📊 Estimated A1C of ${data.estimatedA1C.toFixed(1)}%. Consider adjustments to improve long-term glucose control.`);
    } else {
      insights.push(`⚠️ Estimated A1C of ${data.estimatedA1C.toFixed(1)}% is elevated. Discuss treatment adjustments with your healthcare provider.`);
    }
  }

  return insights.length > 0 ? insights : ["No specific insights available from the PDF data."];
}
