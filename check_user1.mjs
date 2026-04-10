import { getDb } from "./server/db.ts";
import { glucoseReadings, activitySamples, sleepSessions, nutritionLogs } from "./drizzle/schema.ts";
import { eq } from "drizzle-orm";

const db = await getDb();
if (!db) {
  console.error("Database not available");
  process.exit(1);
}

const userId = 1;
const glucose = await db.select().from(glucoseReadings).where(eq(glucoseReadings.userId, userId));
const activity = await db.select().from(activitySamples).where(eq(activitySamples.userId, userId));
const sleep = await db.select().from(sleepSessions).where(eq(sleepSessions.userId, userId));
const nutrition = await db.select().from(nutritionLogs).where(eq(nutritionLogs.userId, userId));

console.log(`User ${userId} data:`);
console.log(`  Glucose readings: ${glucose.length}`);
console.log(`  Activity samples: ${activity.length}`);
console.log(`  Sleep sessions: ${sleep.length}`);
console.log(`  Nutrition logs: ${nutrition.length}`);

process.exit(0);
