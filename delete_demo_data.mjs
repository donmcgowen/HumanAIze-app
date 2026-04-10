import { getDb } from "./server/db.ts";
import { glucoseReadings, activitySamples, sleepSessions, nutritionLogs } from "./drizzle/schema.ts";
import { eq } from "drizzle-orm";

const db = await getDb();
const userId = 1;

console.log("Deleting all data for user 1...");

const glucoseDeleted = await db.delete(glucoseReadings).where(eq(glucoseReadings.userId, userId));
const activityDeleted = await db.delete(activitySamples).where(eq(activitySamples.userId, userId));
const sleepDeleted = await db.delete(sleepSessions).where(eq(sleepSessions.userId, userId));
const nutritionDeleted = await db.delete(nutritionLogs).where(eq(nutritionLogs.userId, userId));

console.log("Deleted:");
console.log("- Glucose readings:", glucoseDeleted.rowsAffected);
console.log("- Activity samples:", activityDeleted.rowsAffected);
console.log("- Sleep sessions:", sleepDeleted.rowsAffected);
console.log("- Nutrition logs:", nutritionDeleted.rowsAffected);

console.log("\nDone! Dashboard will now show 0 values until real data is synced from Dexcom.");
