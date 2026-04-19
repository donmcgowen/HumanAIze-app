/**
 * PDF Extraction Module for Dexcom Clarity Reports
 *
 * Strategy:
 *   Use Gemini File API to upload the PDF, wait for processing, and extract data.
 *   This bypasses pdftoppm entirely and avoids Azure 502 timeouts for large PDFs.
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

const GEMINI_MODEL = "gemini-2.0-flash";

/**
 * Main entry point: parse a Dexcom Clarity PDF buffer using Gemini File API.
 */
export async function parseClarityPDFBuffer(pdfBuffer: Buffer): Promise<ExtractedClarityData> {
  const geminiKey = ENV.geminiApiKey;
  if (!geminiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }

  const data: ExtractedClarityData = {
    rawText: "",
    extractionMethod: "ai",
  };

  let fileName = "";
  let fileUri = "";

  try {
    // 1. Upload to File API
    console.log(`[pdfExtraction] Uploading ${(pdfBuffer.length / 1024 / 1024).toFixed(2)}MB PDF to Gemini File API...`);
    const uploadRes = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${geminiKey}`, {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'raw',
        'X-Goog-Upload-Command': 'start, upload',
        'X-Goog-Upload-Header-Content-Length': pdfBuffer.length.toString(),
        'X-Goog-Upload-Header-Content-Type': 'application/pdf',
        'Content-Type': 'application/pdf',
      },
      body: new Uint8Array(pdfBuffer)
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`Gemini File API upload failed: ${errText.slice(0, 300)}`);
    }

    const uploadData = await uploadRes.json();
    fileName = uploadData.file.name;
    fileUri = uploadData.file.uri;
    console.log(`[pdfExtraction] Uploaded successfully: ${fileName}`);

    // 2. Wait for processing
    let state = uploadData.file.state;
    let attempts = 0;
    while (state === 'PROCESSING' && attempts < 15) { // Max 30 seconds wait
      await new Promise(r => setTimeout(r, 2000));
      const getRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${geminiKey}`);
      if (!getRes.ok) break;
      const getData = await getRes.json();
      state = getData.state;
      attempts++;
    }

    if (state !== 'ACTIVE') {
      throw new Error(`Gemini File API processing failed or timed out. State: ${state}`);
    }

    // 3. Generate content
    console.log(`[pdfExtraction] Generating content from ${fileName}...`);
    const summaryPrompt = `You are a diabetes care specialist analyzing a Dexcom Clarity CGM report.

Extract the following summary statistics from the report:
1. Average Glucose (mg/dL)
2. GMI or A1C estimate (%)
3. Time in Range (%) — glucose 70-180 mg/dL
4. Time Above Range (%) — glucose > 180 mg/dL
5. Time Below Range (%) — glucose < 70 mg/dL
6. Standard Deviation (mg/dL)

Also analyze glucose trends and patterns:
- Time-of-day patterns (morning highs, post-meal spikes, overnight lows)
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
  "summary": "<2-3 sentence plain-English summary of overall glucose control>",
  "insights": [
    "<specific actionable insight 1>",
    "<specific actionable insight 2>",
    "<specific actionable insight 3>"
  ]
}`;

    const genRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { file_data: { mime_type: 'application/pdf', file_uri: fileUri } },
            { text: summaryPrompt }
          ]
        }],
        generationConfig: { temperature: 0, maxOutputTokens: 2048 },
      })
    });

    if (!genRes.ok) {
      const errText = await genRes.text();
      throw new Error(`Gemini generateContent failed: ${errText.slice(0, 300)}`);
    }

    const genData = await genRes.json();
    const text = genData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    if (!text) {
      throw new Error("Gemini returned empty text");
    }

    // Strip markdown code fences if present
    const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();

    // Try to parse the full JSON first
    let parsed: any = {};
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch (e) {
        // JSON is truncated — extract values with regex as fallback
        console.warn("[pdfExtraction] JSON parse failed (likely truncated), using regex fallback");
        const avgMatch = cleaned.match(/"averageGlucose"\s*:\s*(\d+(?:\.\d+)?)/);
        const a1cMatch = cleaned.match(/"a1cEstimate"\s*:\s*(\d+(?:\.\d+)?)/);
        const tirMatch = cleaned.match(/"timeInRange"\s*:\s*(\d+(?:\.\d+)?)/);
        const tarMatch = cleaned.match(/"timeAboveRange"\s*:\s*(\d+(?:\.\d+)?)/);
        const tbrMatch = cleaned.match(/"timeBelowRange"\s*:\s*(\d+(?:\.\d+)?)/);
        const sdMatch = cleaned.match(/"standardDeviation"\s*:\s*(\d+(?:\.\d+)?)/);
        if (avgMatch) parsed.averageGlucose = parseFloat(avgMatch[1]);
        if (a1cMatch) parsed.a1cEstimate = parseFloat(a1cMatch[1]);
        if (tirMatch) parsed.timeInRange = parseFloat(tirMatch[1]);
        if (tarMatch) parsed.timeAboveRange = parseFloat(tarMatch[1]);
        if (tbrMatch) parsed.timeBelowRange = parseFloat(tbrMatch[1]);
        if (sdMatch) parsed.standardDeviation = parseFloat(sdMatch[1]);
      }
    } else {
      // No JSON braces found — try regex extraction directly
      console.warn("[pdfExtraction] No JSON found, using regex extraction");
      const avgMatch = cleaned.match(/"averageGlucose"\s*:\s*(\d+(?:\.\d+)?)/);
      const a1cMatch = cleaned.match(/"a1cEstimate"\s*:\s*(\d+(?:\.\d+)?)/);
      const tirMatch = cleaned.match(/"timeInRange"\s*:\s*(\d+(?:\.\d+)?)/);
      if (avgMatch) parsed.averageGlucose = parseFloat(avgMatch[1]);
      if (a1cMatch) parsed.a1cEstimate = parseFloat(a1cMatch[1]);
      if (tirMatch) parsed.timeInRange = parseFloat(tirMatch[1]);
      if (!parsed.averageGlucose && !parsed.a1cEstimate && !parsed.timeInRange) {
        throw new Error(`No JSON found in Gemini response: ${text.slice(0, 200)}`);
      }
    }

    data.averageGlucose = typeof parsed.averageGlucose === "number" ? parsed.averageGlucose : undefined;
    data.estimatedA1C = typeof parsed.a1cEstimate === "number" ? parsed.a1cEstimate : undefined;
    data.timeInRange = typeof parsed.timeInRange === "number" ? parsed.timeInRange : undefined;
    data.timeAboveRange = typeof parsed.timeAboveRange === "number" ? parsed.timeAboveRange : undefined;
    data.timeBelowRange = typeof parsed.timeBelowRange === "number" ? parsed.timeBelowRange : undefined;
    data.standardDeviation = typeof parsed.standardDeviation === "number" ? parsed.standardDeviation : undefined;
    data.aiSummary = typeof parsed.summary === "string" ? parsed.summary : undefined;
    data.aiInsights = Array.isArray(parsed.insights) ? parsed.insights.filter((i: any) => typeof i === "string") : undefined;

    if (!data.averageGlucose && !data.estimatedA1C && !data.timeInRange) {
      throw new Error("No glucose readings found in this PDF. Please ensure it is a valid Dexcom Clarity report.");
    }

    // Derive A1C from average glucose if still missing
    if (!data.estimatedA1C && typeof data.averageGlucose === "number") {
      data.estimatedA1C = Math.round((((data.averageGlucose / 28.7) + 2.15) * 100)) / 100;
    }

    return data;

  } catch (err: any) {
    console.error("[pdfExtraction] Error:", err);
    throw new Error(`Gemini could not extract data from this PDF: ${err.message}`);
  } finally {
    // 4. Clean up file
    if (fileName) {
      try {
        console.log(`[pdfExtraction] Deleting file ${fileName}...`);
        await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${geminiKey}`, {
          method: 'DELETE'
        });
      } catch (e) {
        console.error(`[pdfExtraction] Failed to delete file ${fileName}:`, e);
      }
    }
  }
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
