import { db } from "./server/db.ts";
import { glucoseReadings, activitySamples, sleepSessions, nutritionLogs } from "./drizzle/schema.ts";

const userId = 1;

const glucose = await db.select().from(glucoseReadings).where(eq(glucoseReadings.userId, userId)).limit(5);
const activity = await db.select().from(activitySamples).where(eq(activitySamples.userId, userId)).limit(5);
const sleep = await db.select().from(sleepSessions).where(eq(sleepSessions.userId, userId)).limit(5);
const nutrition = await db.select().from(nutritionLogs).where(eq(nutritionLogs.userId, userId)).limit(5);

console.log("Glucose readings:", glucose.length);
console.log("Activity samples:", activity.length);
console.log("Sleep sessions:", sleep.length);
console.log("Nutrition logs:", nutrition.length);

if (glucose.length > 0) console.log("First glucose:", glucose[0]);
if (activity.length > 0) console.log("First activity:", activity[0]);
if (sleep.length > 0) console.log("First sleep:", sleep[0]);
