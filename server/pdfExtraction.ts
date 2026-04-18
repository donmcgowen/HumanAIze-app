/**
 * PDF Extraction Module for Dexcom Clarity Reports
 *
 * Dexcom Clarity PDFs are image-based (rendered by HeadlessChrome/Skia).
 * We send the PDF directly to Google Gemini 2.5 Flash which natively reads PDFs.
 * No server-side PDF-to-image conversion needed — works on any server.
 *
 * Gemini inline limit: ~20MB base64 (~15MB raw PDF). Clarity reports are typically
 * 0.4–10MB, well within this limit.
 */

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
  aiInsights?: string[];
}

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_MAX_RAW_BYTES = 14 * 1024 * 1024; // 14MB raw = ~19MB base64, safe under 20MB limit

/**
 * Send a PDF (or PNG) buffer to Gemini 2.5 Flash and extract CGM metrics + trend analysis.
 */
async function callGeminiWithPDF(
  fileBuffer: Buffer,
  mimeType: "application/pdf" | "image/png"
): Promise<{
  averageGlucose?: number;
  timeInRange?: number;
  timeAboveRange?: number;
  timeBelowRange?: number;
  estimatedA1C?: number;
  standardDeviation?: number;
  summary?: string;
  insights?: string[];
} | null> {
  const geminiKey = ENV.geminiApiKey;
  if (!geminiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }

  const base64 = fileBuffer.toString("base64");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`;

  const prompt = `You are a diabetes care specialist analyzing a Dexcom Clarity CGM report.

Extract the following summary statistics:
1. Average Glucose (mg/dL)
2. GMI or A1C estimate (%)
3. Time in Range (%) — glucose 70-180 mg/dL
4. Time Above Range (%) — glucose > 180 mg/dL
5. Time Below Range (%) — glucose < 70 mg/dL
6. Standard Deviation (mg/dL)
7. Report date range (start and end dates if visible)

Then analyze the glucose trends and patterns across the report period. Look for:
- Time-of-day patterns (morning highs, post-meal spikes, overnight lows)
- Day-of-week patterns
- Improvement or worsening trends over time
- Recurring high or low periods
- What appears to be working well
- What needs attention or adjustment

Return ONLY valid JSON (no markdown, no explanation):
{
  "averageGlucose": <number or null>,
  "a1cEstimate": <number or null>,
  "timeInRange": <number or null>,
  "timeAboveRange": <number or null>,
  "timeBelowRange": <number or null>,
  "standardDeviation": <number or null>,
  "reportStartDate": "<string or null>",
  "reportEndDate": "<string or null>",
  "summary": "<2-3 sentence plain-English summary of overall glucose control>",
  "insights": [
    "<specific actionable insight 1>",
    "<specific actionable insight 2>",
    "<specific actionable insight 3>",
    "<specific actionable insight 4>",
    "<specific actionable insight 5>"
  ]
}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType, data: base64 } },
          { text: prompt },
        ],
      }],
      generationConfig: { temperature: 0, maxOutputTokens: 1024 },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errText.slice(0, 300)}`);
  }

  const data = (await response.json()) as any;
  const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  if (!text) return null;

  // Strip markdown code fences if present
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error("[pdfExtraction] No JSON found in Gemini response:", text.slice(0, 200));
    return null;
  }

  let parsed: any = {};
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error("[pdfExtraction] JSON parse failed:", e);
    return null;
  }

  return {
    averageGlucose: typeof parsed.averageGlucose === "number" ? parsed.averageGlucose : undefined,
    estimatedA1C: typeof parsed.a1cEstimate === "number" ? parsed.a1cEstimate : undefined,
    timeInRange: typeof parsed.timeInRange === "number" ? parsed.timeInRange : undefined,
    timeAboveRange: typeof parsed.timeAboveRange === "number" ? parsed.timeAboveRange : undefined,
    timeBelowRange: typeof parsed.timeBelowRange === "number" ? parsed.timeBelowRange : undefined,
    standardDeviation: typeof parsed.standardDeviation === "number" ? parsed.standardDeviation : undefined,
    summary: typeof parsed.summary === "string" ? parsed.summary : undefined,
    insights: Array.isArray(parsed.insights) ? parsed.insights.filter((i: any) => typeof i === "string") : undefined,
  };
}

/**
 * Main entry point: parse a Dexcom Clarity PDF buffer using Gemini vision AI.
 *
 * Strategy:
 *   1. If PDF is under 14MB, send directly to Gemini as application/pdf (preferred)
 *   2. If PDF is over 14MB, try page-1 PNG via pdftoppm as fallback
 *   3. If both fail, throw a helpful error
 */
export async function parseClarityPDFBuffer(pdfBuffer: Buffer): Promise<ExtractedClarityData> {
  const data: ExtractedClarityData = {
    rawText: "",
    extractionMethod: "vision",
  };

  let result: Awaited<ReturnType<typeof callGeminiWithPDF>> = null;

  if (pdfBuffer.length <= GEMINI_MAX_RAW_BYTES) {
    // Primary path: send full PDF to Gemini
    console.log(`[pdfExtraction] Sending ${(pdfBuffer.length / 1024).toFixed(0)}KB PDF directly to Gemini`);
    result = await callGeminiWithPDF(pdfBuffer, "application/pdf");
  } else {
    // Fallback for very large PDFs: try to convert page 1 to PNG
    console.warn(`[pdfExtraction] PDF too large (${(pdfBuffer.length / 1024 / 1024).toFixed(1)}MB), attempting page-1 PNG fallback`);
    try {
      const { execSync, existsSync, writeFileSync, readFileSync, unlinkSync } = await import("child_process").then(() => ({
        execSync: require("child_process").execSync,
        existsSync: require("fs").existsSync,
        writeFileSync: require("fs").writeFileSync,
        readFileSync: require("fs").readFileSync,
        unlinkSync: require("fs").unlinkSync,
      }));
      const os = require("os");
      const path = require("path");
      const id = `clarity_${Date.now()}`;
      const pdfPath = path.join(os.tmpdir(), `${id}.pdf`);
      const outPrefix = path.join(os.tmpdir(), id);
      writeFileSync(pdfPath, pdfBuffer);
      execSync(`pdftoppm -r 150 -png -f 1 -l 1 "${pdfPath}" "${outPrefix}"`, { timeout: 30000, stdio: "pipe" });
      const candidates = [`${outPrefix}-01.png`, `${outPrefix}-1.png`, `${outPrefix}-001.png`];
      for (const candidate of candidates) {
        if (existsSync(candidate)) {
          const pngBuf = readFileSync(candidate);
          try { unlinkSync(candidate); } catch {}
          try { unlinkSync(pdfPath); } catch {}
          result = await callGeminiWithPDF(pngBuf, "image/png");
          break;
        }
      }
      try { unlinkSync(pdfPath); } catch {}
    } catch (err) {
      throw new Error(
        `PDF is too large (${(pdfBuffer.length / 1024 / 1024).toFixed(1)}MB) for direct processing. ` +
        `Please export a shorter date range (30 days recommended) from Dexcom Clarity.`
      );
    }
  }

  if (!result) {
    throw new Error("Gemini could not extract data from this PDF. Please ensure it is a valid Dexcom Clarity report.");
  }

  if (!result.averageGlucose && !result.estimatedA1C && !result.timeInRange) {
    throw new Error("No glucose readings found in this PDF. Please ensure it is a valid Dexcom Clarity report.");
  }

  data.averageGlucose = result.averageGlucose;
  data.timeInRange = result.timeInRange;
  data.timeAboveRange = result.timeAboveRange;
  data.timeBelowRange = result.timeBelowRange;
  data.estimatedA1C = result.estimatedA1C;
  data.standardDeviation = result.standardDeviation;
  data.aiSummary = result.summary;
  data.aiInsights = result.insights;

  // Derive A1C from average glucose if still missing
  if (!data.estimatedA1C && typeof data.averageGlucose === "number") {
    data.estimatedA1C = Math.round((((data.averageGlucose / 28.7) + 2.15) * 100)) / 100;
  }

  return data;
}

/**
 * Kept for backward compatibility.
 */
export async function parseClarityReportText(text: string): Promise<ExtractedClarityData> {
  return { rawText: text, extractionMethod: "regex" };
}

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

export function validateClarityPDF(_text: string): { valid: boolean; error?: string } {
  return { valid: true };
}

export function generateClarityInsights(data: ExtractedClarityData): string[] {
  if (data.aiInsights && data.aiInsights.length > 0) return data.aiInsights;

  const insights: string[] = [];
  if (!data.averageGlucose) {
    return ["Unable to extract glucose data from PDF. Please ensure this is a valid Dexcom Clarity report."];
  }
  if (data.averageGlucose < 100) {
    insights.push("✓ Your average glucose is in a healthy range.");
  } else if (data.averageGlucose < 150) {
    insights.push("📊 Your average glucose is slightly elevated. Consider reviewing your diet and exercise routine.");
  } else {
    insights.push("⚠️ Your average glucose is elevated. Discuss with your healthcare provider about adjusting your diabetes management plan.");
  }
  if (data.timeInRange) {
    if (data.timeInRange >= 70) {
      insights.push(`✓ Excellent time in range (${data.timeInRange}%). You're doing great!`);
    } else if (data.timeInRange >= 50) {
      insights.push(`📊 Good time in range (${data.timeInRange}%). There's room for improvement.`);
    } else {
      insights.push(`⚠️ Low time in range (${data.timeInRange}%). Consider working with your healthcare team.`);
    }
  }
  if (data.estimatedA1C) {
    if (data.estimatedA1C < 7) {
      insights.push(`✓ GMI/A1C of ${data.estimatedA1C}% is within recommended range.`);
    } else {
      insights.push(`⚠️ GMI/A1C of ${data.estimatedA1C}% is elevated. Discuss treatment adjustments with your provider.`);
    }
  }
  return insights.length > 0 ? insights : ["No specific insights available."];
}
