import { getDb } from "./server/db.ts";
import { glucoseReadings } from "./drizzle/schema.ts";

const db = await getDb();
if (!db) {
  console.error("Database not available");
  process.exit(1);
}

const count = await db.select().from(glucoseReadings);
console.log("Total glucose readings:", count.length);
if (count.length > 0) {
  console.log("Sample readings:");
  count.slice(0, 3).forEach(r => {
    console.log(`  User ${r.userId}: ${r.mgdl} mg/dL at ${new Date(r.readingAt).toISOString()}`);
  });
}
process.exit(0);
