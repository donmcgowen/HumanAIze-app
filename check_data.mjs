import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./drizzle/schema.ts";
import { eq } from "drizzle-orm";

const connection = await mysql.createConnection({
  host: process.env.DATABASE_URL?.split("@")[1]?.split("/")[0] || "localhost",
  user: process.env.DATABASE_URL?.split("://")[1]?.split(":")[0] || "root",
  password: process.env.DATABASE_URL?.split(":")[2]?.split("@")[0] || "",
  database: process.env.DATABASE_URL?.split("/").pop() || "health_db"
});

const db = drizzle(connection, { schema });
const userId = 1;

try {
  const glucose = await db.query.glucoseReadings.findMany({ where: eq(schema.glucoseReadings.userId, userId), limit: 1 });
  const activity = await db.query.activitySamples.findMany({ where: eq(schema.activitySamples.userId, userId), limit: 1 });
  const sleep = await db.query.sleepSessions.findMany({ where: eq(schema.sleepSessions.userId, userId), limit: 1 });
  
  console.log("Glucose count:", glucose.length);
  console.log("Activity count:", activity.length);
  console.log("Sleep count:", sleep.length);
  
  if (glucose.length > 0) console.log("Glucose sample:", JSON.stringify(glucose[0], null, 2));
  if (activity.length > 0) console.log("Activity sample:", JSON.stringify(activity[0], null, 2));
  if (sleep.length > 0) console.log("Sleep sample:", JSON.stringify(sleep[0], null, 2));
} finally {
  await connection.end();
}
