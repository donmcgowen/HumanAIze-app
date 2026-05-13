export type IntakeIntent = "food" | "glucose" | "workout";

export function detectIntentsFromTranscript(transcript: string): IntakeIntent[] {
  const lower = transcript.toLowerCase();
  const intents: IntakeIntent[] = [];

  if (/(food|meal|ate|breakfast|lunch|dinner|snack|protein|carbs|fat|chicken|rice|potato)/.test(lower)) {
    intents.push("food");
  }
  if (/(glucose|blood sugar|mg\/?d?l|dexcom|cgm)/.test(lower)) {
    intents.push("glucose");
  }
  if (/(workout|exercise|lift|bench|run|walk|cycling|cardio|sets|reps|min|minutes)/.test(lower)) {
    intents.push("workout");
  }

  return intents.length > 0 ? intents : ["food"];
}

export function extractGlucoseFromTranscript(transcript: string): number | null {
  const match = transcript.match(/(\d{2,3})(?:\s*(?:mg\/?d?l))?/i);
  const mgdl = match ? Number(match[1]) : 0;
  if (mgdl >= 40 && mgdl <= 500) {
    return mgdl;
  }
  return null;
}

export function requiresLowConfidenceOverride(overallConfidence: number): boolean {
  return overallConfidence > 0 && overallConfidence < 0.6;
}
