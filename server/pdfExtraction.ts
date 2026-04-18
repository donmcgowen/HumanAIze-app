/**
 * PDF Extraction Module for Dexcom Clarity Reports
 *
 * Extracts glucose statistics from Dexcom Clarity PDF reports using:
 * 1. Regex-based parsing (fast, no API cost)
 * 2. AI fallback via GPT-4o-mini if regex finds nothing
 */

import { invokeLLM } from "./_core/llm";

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
  readings?: Array<{
    timestamp: string;
    value: number;
  }>;
  rawText: string;
  extractionMethod?: "regex" | "ai";
  aiSummary?: string;
}

/**
 * Extract text from PDF buffer using pdf-parse
 */
export async function extractTextFromPDF(pdfBuffer: Buffer): Promise<string> {
  try {
    // Dynamic import to avoid bundling issues
    const pdfParse = await import("pdf-parse");
    const parseFn = (pdfParse as any).default ?? pdfParse;
    const data = await parseFn(pdfBuffer);
    return data.text;
  } catch (error) {
    throw new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Parse Dexcom Clarity report text using regex first, then AI fallback
 */
export async function parseClarityReportText(text: string): Promise<ExtractedClarityData> {
  const data: ExtractedClarityData = {
    rawText: text,
    extractionMethod: "regex",
  };

  // --- Regex extraction ---

  // Average glucose: "Average Glucose: 145 mg/dL" or "Average 145 mg/dL"
  const avgPatterns = [
    /Average\s+Glucose[:\s]+(\d+)\s*mg\/dL/i,
    /Avg\s+Glucose[:\s]+(\d+)/i,
    /Average[:\s]+(\d+)\s*mg\/dL/i,
    /Mean\s+Glucose[:\s]+(\d+)/i,
  ];
  for (const p of avgPatterns) {
    const m = text.match(p);
    if (m) { data.averageGlucose = parseInt(m[1], 10); break; }
  }

  // Min glucose
  const minMatch = text.match(/(?:Lowest|Minimum|Min)[:\s]+(\d+)\s*mg\/dL/i);
  if (minMatch) data.minGlucose = parseInt(minMatch[1], 10);

  // Max glucose
  const maxMatch = text.match(/(?:Highest|Maximum|Max)[:\s]+(\d+)\s*mg\/dL/i);
  if (maxMatch) data.maxGlucose = parseInt(maxMatch[1], 10);

  // Time in range
  const tirPatterns = [
    /(\d+(?:\.\d+)?)\s*%\s+In\s+Range/i,
    /Time\s+in\s+Range[:\s]+(\d+(?:\.\d+)?)\s*%/i,
    /In\s+Range[:\s]+(\d+(?:\.\d+)?)\s*%/i,
    /(\d+(?:\.\d+)?)\s*%\s*(?:time\s+)?in\s+range/i,
  ];
  for (const p of tirPatterns) {
    const m = text.match(p);
    if (m) { data.timeInRange = parseFloat(m[1]); break; }
  }

  // Time above range
  const tarMatch = text.match(/(?:Time\s+)?Above\s+Range[:\s]+(\d+(?:\.\d+)?)\s*%/i);
  if (tarMatch) data.timeAboveRange = parseFloat(tarMatch[1]);

  // Time below range
  const tbrMatch = text.match(/(?:Time\s+)?Below\s+Range[:\s]+(\d+(?:\.\d+)?)\s*%/i);
  if (tbrMatch) data.timeBelowRange = parseFloat(tbrMatch[1]);

  // Standard deviation
  const stdMatch = text.match(/Standard\s+Deviation[:\s]+(\d+(?:\.\d+)?)/i);
  if (stdMatch) data.standardDeviation = parseFloat(stdMatch[1]);

  // Coefficient of variation
  const cvMatch = text.match(/Coefficient\s+of\s+Variation[:\s]+(\d+(?:\.\d+)?)\s*%/i);
  if (cvMatch) data.coefficient = parseFloat(cvMatch[1]);

  // Estimated A1C / GMI
  const a1cPatterns = [
    /Estimated\s+A1C[:\s]+(\d+(?:\.\d+)?)\s*%/i,
    /GMI[:\s]+(\d+(?:\.\d+)?)\s*%/i,
    /A1C\s+Estimate[:\s]+(\d+(?:\.\d+)?)\s*%/i,
    /eA1C[:\s]+(\d+(?:\.\d+)?)\s*%/i,
  ];
  for (const p of a1cPatterns) {
    const m = text.match(p);
    if (m) { data.estimatedA1C = parseFloat(m[1]); break; }
  }

  // Derive A1C from average glucose if still missing
  if (data.estimatedA1C === undefined && typeof data.averageGlucose === "number") {
    data.estimatedA1C = Math.round((((data.averageGlucose / 28.7) + 2.15) * 100)) / 100;
  }

  // Report period dates
  const dateMatch = text.match(/(?:Report|Period)[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})\s*(?:to|[-–])\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  if (dateMatch) {
    data.reportPeriod = { startDate: dateMatch[1], endDate: dateMatch[2] };
  }

  // --- AI fallback if regex found nothing useful ---
  const hasData = data.averageGlucose !== undefined || data.timeInRange !== undefined || data.estimatedA1C !== undefined;

  if (!hasData) {
    try {
      const aiResult = await extractWithAI(text);
      if (aiResult) {
        data.extractionMethod = "ai";
        if (aiResult.averageGlucose) data.averageGlucose = aiResult.averageGlucose;
        if (aiResult.timeInRange) data.timeInRange = aiResult.timeInRange;
        if (aiResult.estimatedA1C) data.estimatedA1C = aiResult.estimatedA1C;
        if (aiResult.timeAboveRange) data.timeAboveRange = aiResult.timeAboveRange;
        if (aiResult.timeBelowRange) data.timeBelowRange = aiResult.timeBelowRange;
        if (aiResult.standardDeviation) data.standardDeviation = aiResult.standardDeviation;
        if (aiResult.minGlucose) data.minGlucose = aiResult.minGlucose;
        if (aiResult.maxGlucose) data.maxGlucose = aiResult.maxGlucose;
        if (aiResult.summary) data.aiSummary = aiResult.summary;

        // Derive A1C if still missing
        if (data.estimatedA1C === undefined && typeof data.averageGlucose === "number") {
          data.estimatedA1C = Math.round((((data.averageGlucose / 28.7) + 2.15) * 100)) / 100;
        }
      }
    } catch (aiError) {
      console.error("AI PDF extraction failed:", aiError);
      // Continue with whatever regex found (possibly empty)
    }
  } else {
    // Even when regex succeeds, get an AI summary
    try {
      const aiResult = await extractWithAI(text, true);
      if (aiResult?.summary) data.aiSummary = aiResult.summary;
    } catch {
      // Non-critical, ignore
    }
  }

  return data;
}

/**
 * Use GPT-4o-mini to extract glucose metrics from PDF text
 */
async function extractWithAI(text: string, summaryOnly = false): Promise<{
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
  // Truncate to first 4000 chars to stay within token limits
  const truncatedText = text.slice(0, 4000);

  const prompt = summaryOnly
    ? `You are a diabetes health assistant. Based on this Dexcom Clarity report text, write a 2-3 sentence plain-English summary of the patient's glucose control. Be specific about the numbers. Text:\n\n${truncatedText}`
    : `You are a medical data extraction assistant. Extract glucose statistics from this Dexcom Clarity PDF report text and return them as JSON.

Return ONLY a JSON object with these fields (use null if not found):
{
  "averageGlucose": <number in mg/dL or null>,
  "timeInRange": <percentage 0-100 or null>,
  "estimatedA1C": <percentage like 6.5 or null>,
  "timeAboveRange": <percentage 0-100 or null>,
  "timeBelowRange": <percentage 0-100 or null>,
  "standardDeviation": <number in mg/dL or null>,
  "minGlucose": <number in mg/dL or null>,
  "maxGlucose": <number in mg/dL or null>,
  "summary": "<2-3 sentence plain-English summary of glucose control>"
}

PDF text:
${truncatedText}`;

  const result = await invokeLLM({
    messages: [{ role: "user", content: prompt }],
    maxTokens: summaryOnly ? 200 : 500,
  });

  const content = result.choices[0]?.message?.content;
  if (!content || typeof content !== "string") return null;

  if (summaryOnly) {
    return { summary: content.trim() };
  }

  // Parse JSON response
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      averageGlucose: parsed.averageGlucose ?? undefined,
      timeInRange: parsed.timeInRange ?? undefined,
      estimatedA1C: parsed.estimatedA1C ?? undefined,
      timeAboveRange: parsed.timeAboveRange ?? undefined,
      timeBelowRange: parsed.timeBelowRange ?? undefined,
      standardDeviation: parsed.standardDeviation ?? undefined,
      minGlucose: parsed.minGlucose ?? undefined,
      maxGlucose: parsed.maxGlucose ?? undefined,
      summary: parsed.summary ?? undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Generate insights from extracted Clarity data
 */
export function generateClarityInsights(data: ExtractedClarityData): string[] {
  const insights: string[] = [];

  if (!data.averageGlucose) {
    return ["Unable to extract glucose data from PDF. Please ensure it's a valid Dexcom Clarity report."];
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

/**
 * Validate if PDF appears to be a Dexcom Clarity report
 */
export function validateClarityPDF(text: string): { valid: boolean; error?: string } {
  if (!text || text.trim().length === 0) {
    return { valid: false, error: "PDF appears to be empty or could not be read" };
  }

  // Be permissive — if it has any glucose-related content, accept it
  const isClarityReport = /clarity|dexcom|glucose|average|time in range|a1c|mg\/dl/i.test(text);
  if (!isClarityReport) {
    return { valid: false, error: "PDF does not appear to be a Dexcom Clarity report. Please upload a Clarity PDF export." };
  }

  return { valid: true };
}
