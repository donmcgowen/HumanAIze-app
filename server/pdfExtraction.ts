/**
 * PDF Extraction Module for Dexcom Clarity Reports
 *
 * Strategy:
 *   1. PRIMARY: Convert page 1 to PNG via pdftoppm, send to Gemini vision (fast, ~5s)
 *   2. SECONDARY: For trend insights, send full PDF to Gemini if under 14MB (slower, ~30s)
 *   3. FALLBACK: If pdftoppm not available, send full PDF directly to Gemini
 *
 * Dexcom Clarity PDFs are image-based (HeadlessChrome/Skia), so text extraction returns nothing.
 * Page 1 contains all summary stats (Average Glucose, GMI, Time in Range).
 * Full PDF contains daily charts needed for trend analysis.
 */

import { ENV } from "./_core/env";
import { execSync } from "child_process";
import { existsSync, writeFileSync, readFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

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
const GEMINI_MAX_RAW_BYTES = 14 * 1024 * 1024; // 14MB raw = ~19MB base64

/**
 * Convert PDF page 1 to PNG using pdftoppm.
 * Returns PNG buffer, or null if pdftoppm is not available.
 */
async function pdfPage1ToPNG(pdfBuffer: Buffer): Promise<Buffer | null> {
  const id = `clarity_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const pdfPath = join(tmpdir(), `${id}.pdf`);
  const outPrefix = join(tmpdir(), id);

  try {
    writeFileSync(pdfPath, pdfBuffer);

    // Try multiple pdftoppm paths
    const pdftoppmPaths = ["pdftoppm", "/usr/bin/pdftoppm", "/usr/local/bin/pdftoppm"];
    let succeeded = false;

    for (const bin of pdftoppmPaths) {
      try {
        execSync(`${bin} -r 150 -png -f 1 -l 1 "${pdfPath}" "${outPrefix}"`, {
          timeout: 30000,
          stdio: "ignore",
        });
        succeeded = true;
        break;
      } catch {
        // try next
      }
    }

    if (!succeeded) {
      // Try Python pdf2image as fallback
      try {
        execSync(
          `python3 -c "
from pdf2image import convert_from_bytes
import base64, sys
with open('${pdfPath}', 'rb') as f:
    pdf_bytes = f.read()
pages = convert_from_bytes(pdf_bytes, dpi=150, first_page=1, last_page=1)
pages[0].save('${outPrefix}-01.png', 'PNG')
"`,
          { timeout: 30000, stdio: "ignore" }
        );
        succeeded = true;
      } catch {
        // pdf2image also failed
      }
    }

    if (!succeeded) {
      return null;
    }

    // Find the output PNG
    const candidates = [
      `${outPrefix}-01.png`,
      `${outPrefix}-1.png`,
      `${outPrefix}-001.png`,
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        const pngBuf = readFileSync(candidate);
        try { unlinkSync(candidate); } catch {}
        return pngBuf;
      }
    }
    return null;
  } catch (err) {
    console.error("[pdfExtraction] pdfPage1ToPNG error:", err);
    return null;
  } finally {
    try { unlinkSync(pdfPath); } catch {}
  }
}

/**
 * Call Gemini with a file buffer (PDF or PNG) and extract CGM metrics.
 */
async function callGemini(
  fileBuffer: Buffer,
  mimeType: "application/pdf" | "image/png",
  includeTrendAnalysis: boolean
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

  const summaryPrompt = `You are a diabetes care specialist analyzing a Dexcom Clarity CGM report.

Extract the following summary statistics from the report:
1. Average Glucose (mg/dL)
2. GMI or A1C estimate (%)
3. Time in Range (%) — glucose 70-180 mg/dL
4. Time Above Range (%) — glucose > 180 mg/dL
5. Time Below Range (%) — glucose < 70 mg/dL
6. Standard Deviation (mg/dL)

${includeTrendAnalysis ? `Also analyze glucose trends and patterns:
- Time-of-day patterns (morning highs, post-meal spikes, overnight lows)
- Improvement or worsening trends over time
- Recurring high or low periods
- What appears to be working well
- What needs attention or adjustment

` : ""}Return ONLY valid JSON (no markdown, no explanation):
{
  "averageGlucose": <number or null>,
  "a1cEstimate": <number or null>,
  "timeInRange": <number or null>,
  "timeAboveRange": <number or null>,
  "timeBelowRange": <number or null>,
  "standardDeviation": <number or null>,
  "summary": "<2-3 sentence plain-English summary of overall glucose control>",
  "insights": [${includeTrendAnalysis ? `
    "<specific actionable insight 1>",
    "<specific actionable insight 2>",
    "<specific actionable insight 3>",
    "<specific actionable insight 4>",
    "<specific actionable insight 5>"` : ""}
  ]
}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000); // 90s timeout

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType, data: base64 } },
            { text: summaryPrompt },
          ],
        }],
        generationConfig: { temperature: 0, maxOutputTokens: includeTrendAnalysis ? 1024 : 512 },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${errText.slice(0, 300)}`);
    }

    const data = (await response.json()) as any;
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    if (!text) {
      console.error("[pdfExtraction] Gemini returned empty text");
      return null;
    }

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
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Main entry point: parse a Dexcom Clarity PDF buffer using Gemini vision AI.
 *
 * Strategy:
 *   1. Try page-1 PNG via pdftoppm (fast, ~5s, works on any size PDF)
 *   2. If pdftoppm not available, send full PDF to Gemini directly (works for PDFs under 14MB)
 *   3. For trend insights, attempt full PDF analysis separately (non-blocking)
 */
export async function parseClarityPDFBuffer(pdfBuffer: Buffer): Promise<ExtractedClarityData> {
  const data: ExtractedClarityData = {
    rawText: "",
    extractionMethod: "vision",
  };

  let result: Awaited<ReturnType<typeof callGemini>> = null;

  // Step 1: Try page-1 PNG (fast path)
  console.log(`[pdfExtraction] Attempting page-1 PNG extraction for ${(pdfBuffer.length / 1024).toFixed(0)}KB PDF`);
  const pngBuf = await pdfPage1ToPNG(pdfBuffer);

  if (pngBuf) {
    console.log(`[pdfExtraction] Got page-1 PNG (${(pngBuf.length / 1024).toFixed(0)}KB), sending to Gemini`);
    // For page-1 PNG, skip trend analysis (no daily charts visible)
    result = await callGemini(pngBuf, "image/png", false);

    // Note: Full PDF trend analysis removed to avoid Azure timeout (230s limit).
    // Page-1 PNG contains all summary stats needed.
  } else {
    // Step 2: pdftoppm not available — send full PDF directly
    if (pdfBuffer.length <= GEMINI_MAX_RAW_BYTES) {
      console.log(`[pdfExtraction] pdftoppm unavailable, sending full PDF to Gemini`);
      result = await callGemini(pdfBuffer, "application/pdf", pdfBuffer.length < 5 * 1024 * 1024);
    } else {
      throw new Error(
        `PDF is too large (${(pdfBuffer.length / 1024 / 1024).toFixed(1)}MB) and pdftoppm is not available on this server. ` +
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
