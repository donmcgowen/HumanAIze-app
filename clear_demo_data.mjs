import { getDb } from "./server/db.ts";
import { glucoseReadings, activitySamples, sleepSessions, nutritionLogs, aiInsights } from "./drizzle/schema.ts";
import { eq } from "drizzle-orm";

const db = await getDb();
if (!db) {
  console.error("Database not available");
  process.exit(1);
}

// Delete all demo data for user 1
const userId = 1;

console.log("Deleting demo data for user", userId);
await db.delete(glucoseReadings).where(eq(glucoseReadings.userId, userId));
await db.delete(activitySamples).where(eq(activitySamples.userId, userId));
await db.delete(sleepSessions).where(eq(sleepSessions.userId, userId));
await db.delete(nutritionLogs).where(eq(nutritionLogs.userId, userId));
await db.delete(aiInsights).where(eq(aiInsights.userId, userId));

console.log("✓ Demo data deleted");
process.exit(0);
