import { describe, it, expect, beforeAll } from "vitest";
import { drizzle } from "drizzle-orm/mysql2";
import { ENV } from "./_core/env";

describe("Azure SQL Connection", () => {
  it("should have Azure SQL connection string configured", () => {
    expect(ENV.azureSqlConnectionString).toBeTruthy();
    expect(ENV.azureSqlConnectionString).toContain("humanaize-sql-1");
    expect(ENV.azureSqlConnectionString).toContain("humanaize-data");
  });

  it("should have database URL set to Azure SQL connection", () => {
    expect(ENV.databaseUrl).toBeTruthy();
    expect(ENV.databaseUrl).toContain("humanaize-sql-1");
  });

  it("should validate Azure SQL connection string format", () => {
    const connStr = ENV.azureSqlConnectionString;
    expect(connStr).toMatch(/Server=tcp:/);
    expect(connStr).toMatch(/Initial Catalog=/);
    expect(connStr).toMatch(/User ID=/);
    expect(connStr).toMatch(/Password=/);
    expect(connStr).toMatch(/Encrypt=True/);
  });

  it("should have correct server and database names", () => {
    const connStr = ENV.azureSqlConnectionString;
    expect(connStr).toContain("humanaize-sql-1.database.windows.net");
    expect(connStr).toContain("humanaize-data");
    expect(connStr).toContain("dbadmin");
  });
});
