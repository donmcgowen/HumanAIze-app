import { getDb } from "./server/db.ts";
import { glucoseReadings, activitySamples, sleepSessions, nutritionLogs } from "./drizzle/schema.ts";
import { eq, count } from "drizzle-orm";

const db = getDb();
const userId = 1;

const glucoseCount = await db.select({ count: count() }).from(glucoseReadings).where(eq(glucoseReadings.userId, userId));
const activityCount = await db.select({ count: count() }).from(activitySamples).where(eq(activitySamples.userId, userId));
const sleepCount = await db.select({ count: count() }).from(sleepSessions).where(eq(sleepSessions.userId, userId));
const nutritionCount = await db.select({ count: count() }).from(nutritionLogs).where(eq(nutritionLogs.userId, userId));

console.log("Glucose:", glucoseCount[0].count);
console.log("Activity:", activityCount[0].count);
console.log("Sleep:", sleepCount[0].count);
console.log("Nutrition:", nutritionCount[0].count);

if (activityCount[0].count > 0) {
  const sample = await db.select().from(activitySamples).where(eq(activitySamples.userId, userId)).limit(1);
  console.log("Activity sample:", sample[0]);
}
