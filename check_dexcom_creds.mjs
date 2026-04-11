import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { healthSources } from "./drizzle/schema.ts";
import { eq } from "drizzle-orm";

const connection = await mysql.createConnection(process.env.DATABASE_URL);
const db = drizzle(connection, { mode: "default", schema: { healthSources } });

try {
  const dexcomSources = await db
    .select()
    .from(healthSources)
    .where(eq(healthSources.provider, "dexcom"));

  console.log("Dexcom sources found:", dexcomSources.length);
  
  for (const source of dexcomSources) {
    console.log("\nSource:", source.displayName);
    console.log("Provider:", source.provider);
    console.log("Status:", source.status);
    console.log("Metadata:", JSON.stringify(source.metadata, null, 2));
    
    if (source.metadata && typeof source.metadata === "object") {
      const metadata = source.metadata;
      if (metadata.credentials) {
        console.log("Has credentials:", !!metadata.credentials);
        console.log("Has accessToken:", !!metadata.credentials.accessToken);
      }
    }
  }
} finally {
  await connection.end();
}
