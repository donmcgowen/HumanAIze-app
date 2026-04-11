import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { glucoseReadings, activitySamples, sleepSessions, nutritionLogs } from "./drizzle/schema.ts";
import { eq } from "drizzle-orm";

const connection = await mysql.createConnection(process.env.DATABASE_URL);
const db = drizzle(connection, { schema: { glucoseReadings, activitySamples, sleepSessions, nutritionLogs } });

const userId = 1;
console.log("Deleting all data for user 1...");

try {
  const result1 = await db.delete(glucoseReadings).where(eq(glucoseReadings.userId, userId));
  const result2 = await db.delete(activitySamples).where(eq(activitySamples.userId, userId));
  const result3 = await db.delete(sleepSessions).where(eq(sleepSessions.userId, userId));
  const result4 = await db.delete(nutritionLogs).where(eq(nutritionLogs.userId, userId));
  
  console.log("✓ Deleted glucose readings");
  console.log("✓ Deleted activity samples");
  console.log("✓ Deleted sleep sessions");
  console.log("✓ Deleted nutrition logs");
  console.log("\nDashboard will now show 0 values until real Dexcom data is synced.");
} finally {
  await connection.end();
}
