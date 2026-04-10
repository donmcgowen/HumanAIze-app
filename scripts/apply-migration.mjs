import fs from "node:fs/promises";
import mysql from "mysql2/promise";

const sqlPath = process.argv[2];
if (!sqlPath) {
  throw new Error("Usage: node scripts/apply-migration.mjs <sql-file>");
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set.");
}

const sql = await fs.readFile(sqlPath, "utf8");
const statements = sql
  .split("--> statement-breakpoint")
  .map((statement) => statement.trim())
  .filter(Boolean);

const connection = await mysql.createConnection(databaseUrl);

try {
  await connection.beginTransaction();

  for (const statement of statements) {
    await connection.query(statement);
  }

  await connection.commit();
  console.log(`Applied ${statements.length} statements from ${sqlPath}`);
} catch (error) {
  await connection.rollback();
  console.error("Failed to apply migration:", error);
  process.exitCode = 1;
} finally {
  await connection.end();
}
