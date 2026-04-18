import { and, eq, gte, lte, lt, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, userProfiles, InsertUserProfile, UserProfile, foodLogs, InsertFoodLog, FoodLog, healthSources, favoriteFoods, InsertFavoriteFood, FavoriteFood, mealTemplates, InsertMealTemplate, MealTemplate, foodSearchCache, InsertFoodSearchCache, FoodSearchCache, progressPhotos, InsertProgressPhoto, ProgressPhoto, glucoseReadings, GlucoseReading, activitySamples, weightEntries, InsertWeightEntry, WeightEntry, workoutEntries, InsertWorkoutEntry, WorkoutEntry, bodyMeasurements, InsertBodyMeasurement, BodyMeasurement } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { getAzureSqlPool } from "./azureDb";
import { calculateMacroTargets, calculateTDEE, type FitnessGoal } from "./fitnessGoal";

let _db: ReturnType<typeof drizzle> | null = null;
let _didLogMissingConfig = false;
let _didLogIncompatibleConfig = false;

type DbConfigSource = "DATABASE_URL" | "AZURE_SQL_CONNECTION_STRING" | "none";

export type DatabaseDiagnostics = {
  configured: boolean;
  source: DbConfigSource;
  looksLikeSqlServer: boolean;
  looksLikeMysqlUrl: boolean;
};

export function getDatabaseDiagnostics(): DatabaseDiagnostics {
  const source: DbConfigSource = process.env.DATABASE_URL
    ? "DATABASE_URL"
    : process.env.AZURE_SQL_CONNECTION_STRING
      ? "AZURE_SQL_CONNECTION_STRING"
      : "none";

  const connectionString = ENV.databaseUrl;
  const normalized = connectionString.toLowerCase();

  return {
    configured: Boolean(connectionString),
    source,
    looksLikeSqlServer: normalized.includes("server=tcp:"),
    looksLikeMysqlUrl: normalized.startsWith("mysql://") || normalized.startsWith("mysql2://"),
  };
}

export async function getDb() {
  const diagnostics = getDatabaseDiagnostics();
  const connectionString = ENV.databaseUrl;

  if (!_db && connectionString) {
    try {
      // The current Drizzle setup targets MySQL-compatible databases.
      // Azure SQL Server-style strings are not compatible with this driver.
      if (diagnostics.looksLikeSqlServer) {
        if (!_didLogIncompatibleConfig) {
          console.warn(
            "[Database] Detected Azure SQL Server connection string, but current DB driver is MySQL-compatible. Set DATABASE_URL (or AZURE_SQL_CONNECTION_STRING) to a MySQL/TiDB URL."
          );
          _didLogIncompatibleConfig = true;
        }
        return null;
      }

      _db = drizzle(connectionString);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }

  if (!_db && !connectionString) {
    if (!_didLogMissingConfig) {
      console.warn(
        "[Database] No database connection string configured. Set DATABASE_URL (preferred) or AZURE_SQL_CONNECTION_STRING to a MySQL-compatible URL."
      );
      _didLogMissingConfig = true;
    }
  }

  return _db;
}

export async function getDatabaseHealth() {
  const diagnostics = getDatabaseDiagnostics();

  if (!diagnostics.configured) {
    return {
      ok: false,
      diagnostics,
      reason: "missing_connection_string" as const,
    };
  }

  if (diagnostics.looksLikeSqlServer) {
    try {
      const pool = await getAzureSqlPool();
      await pool.request().query("SELECT 1 AS ok");
      return {
        ok: true,
        diagnostics,
        reason: "connected_azure_sql_fallback" as const,
      };
    } catch {
      return {
        ok: false,
        diagnostics,
        reason: "azure_sql_connection_failed" as const,
      };
    }
  }

  const db = await getDb();
  return {
    ok: Boolean(db),
    diagnostics,
    reason: db ? ("connected" as const) : ("connection_failed" as const),
  };
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    // Only use onDuplicateKeyUpdate if there are fields to update
    if (Object.keys(updateSet).length > 0) {
      await db
        .insert(users)
        .values(values)
        .onDuplicateKeyUpdate({
          set: updateSet,
        });
    } else {
      // If no fields to update, just insert (will be ignored if duplicate)
      await db.insert(users).values(values).catch(() => {
        // Ignore duplicate key error
      });
    }
  } catch (error) {
    console.warn("[Database] Error upserting user:", error);
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserProfile(userId: number): Promise<UserProfile | null> {
  const db = await getDb();
  if (!db) {
    // Azure SQL fallback for profile reads when MySQL driver is not available.
    if (!ENV.azureSqlConnectionString) {
      console.warn("[Database] Cannot get profile: database not available");
      return null;
    }

    try {
      const pool = await getAzureSqlPool();
      await pool.request().query(`
IF OBJECT_ID(N'dbo.user_profiles', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[user_profiles] (
    [id] INT IDENTITY(1,1) PRIMARY KEY,
    [userId] INT NOT NULL UNIQUE,
    [heightIn] INT NULL,
    [weightLbs] INT NULL,
    [ageYears] INT NULL,
    [fitnessGoal] NVARCHAR(32) NULL,
    [goalWeightLbs] INT NULL,
    [goalDate] BIGINT NULL,
    [dailyCalorieTarget] INT NULL,
    [dailyProteinTarget] INT NULL,
    [dailyCarbsTarget] INT NULL,
    [dailyFatTarget] INT NULL,
    [cgmAverageGlucose] INT NULL,
    [cgmTimeInRange] FLOAT NULL,
    [cgmA1cEstimate] FLOAT NULL,
    [createdAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    [updatedAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END
      `);

      await pool.request().query(`
IF COL_LENGTH('dbo.user_profiles', 'goalWeightLbs') IS NULL
  ALTER TABLE [dbo].[user_profiles] ADD [goalWeightLbs] INT NULL;
IF COL_LENGTH('dbo.user_profiles', 'goalDate') IS NULL
  ALTER TABLE [dbo].[user_profiles] ADD [goalDate] BIGINT NULL;
IF COL_LENGTH('dbo.user_profiles', 'dailyCalorieTarget') IS NULL
  ALTER TABLE [dbo].[user_profiles] ADD [dailyCalorieTarget] INT NULL;
IF COL_LENGTH('dbo.user_profiles', 'dailyProteinTarget') IS NULL
  ALTER TABLE [dbo].[user_profiles] ADD [dailyProteinTarget] INT NULL;
IF COL_LENGTH('dbo.user_profiles', 'dailyCarbsTarget') IS NULL
  ALTER TABLE [dbo].[user_profiles] ADD [dailyCarbsTarget] INT NULL;
IF COL_LENGTH('dbo.user_profiles', 'dailyFatTarget') IS NULL
  ALTER TABLE [dbo].[user_profiles] ADD [dailyFatTarget] INT NULL;
IF COL_LENGTH('dbo.user_profiles', 'cgmAverageGlucose') IS NULL
  ALTER TABLE [dbo].[user_profiles] ADD [cgmAverageGlucose] INT NULL;
IF COL_LENGTH('dbo.user_profiles', 'cgmTimeInRange') IS NULL
  ALTER TABLE [dbo].[user_profiles] ADD [cgmTimeInRange] FLOAT NULL;
IF COL_LENGTH('dbo.user_profiles', 'cgmA1cEstimate') IS NULL
  ALTER TABLE [dbo].[user_profiles] ADD [cgmA1cEstimate] FLOAT NULL;
      `);

      const result = await pool
        .request()
        .input("userId", userId)
        .query<any>(`
SELECT TOP 1
  [id],
  [userId],
  [heightIn],
  [weightLbs],
  [ageYears],
  [fitnessGoal],
  [goalWeightLbs],
  [goalDate],
  [dailyCalorieTarget],
  [dailyProteinTarget],
  [dailyCarbsTarget],
  [dailyFatTarget],
  [cgmAverageGlucose],
  [cgmTimeInRange],
  [cgmA1cEstimate],
  [activityLevel],
  [diabetesType],
  [createdAt],
  [updatedAt]
FROM [dbo].[user_profiles]
WHERE [userId] = @userId
        `);

      const row = result.recordset?.[0];
      if (!row) return null;

      const profile = {
        id: row.id,
        userId: row.userId,
        heightIn: row.heightIn,
        weightLbs: row.weightLbs,
        ageYears: row.ageYears,
        fitnessGoal: row.fitnessGoal,
        goalWeightLbs: row.goalWeightLbs,
        goalDate: row.goalDate,
        dailyCalorieTarget: row.dailyCalorieTarget,
        dailyProteinTarget: row.dailyProteinTarget,
        dailyCarbsTarget: row.dailyCarbsTarget,
        dailyFatTarget: row.dailyFatTarget,
        cgmAverageGlucose: row.cgmAverageGlucose,
        cgmTimeInRange: row.cgmTimeInRange,
        cgmA1cEstimate: row.cgmA1cEstimate,
        activityLevel: row.activityLevel ?? "moderately_active",
        diabetesType: row.diabetesType ?? null,
        createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
        updatedAt: row.updatedAt ? new Date(row.updatedAt) : new Date(),
      } as UserProfile;

      return resolveProfileTargets(profile);
    } catch (error) {
      console.warn("[Database] Error getting user profile (Azure SQL):", error);
      return null;
    }
  }

  try {
    const result = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
    return result.length > 0 ? resolveProfileTargets(result[0]) : null;
  } catch (error) {
    console.warn("[Database] Error getting user profile:", error);
    return null;
  }
}

function resolveProfileTargets(profile: UserProfile): UserProfile {
  const hasStoredTargets =
    typeof profile.dailyCalorieTarget === "number" && profile.dailyCalorieTarget > 0 &&
    typeof profile.dailyProteinTarget === "number" && profile.dailyProteinTarget > 0 &&
    typeof profile.dailyCarbsTarget === "number" && profile.dailyCarbsTarget > 0 &&
    typeof profile.dailyFatTarget === "number" && profile.dailyFatTarget > 0;

  if (hasStoredTargets) {
    return profile;
  }

  const hasBiometrics =
    typeof profile.weightLbs === "number" && profile.weightLbs > 0 &&
    typeof profile.heightIn === "number" && profile.heightIn > 0 &&
    typeof profile.ageYears === "number" && profile.ageYears > 0;

  const goal = (profile.fitnessGoal || "maintain") as FitnessGoal;
  if (!hasBiometrics || !goal) {
    return profile;
  }

  try {
    const weightLbs = profile.weightLbs as number;
    const heightIn = profile.heightIn as number;
    const ageYears = profile.ageYears as number;

    const weightKg = weightLbs * 0.453592;
    const heightCm = heightIn * 2.54;
    const tdee = calculateTDEE(weightKg, heightCm, ageYears, true);
    const targets = calculateMacroTargets(
      tdee,
      weightKg,
      goal,
      weightLbs,
      profile.goalWeightLbs ?? undefined,
      profile.goalDate ?? undefined
    );

    return {
      ...profile,
      dailyCalorieTarget: targets.dailyCalories,
      dailyProteinTarget: targets.dailyProtein,
      dailyCarbsTarget: targets.dailyCarbs,
      dailyFatTarget: targets.dailyFat,
    };
  } catch {
    return profile;
  }
}

export async function upsertUserProfile(userId: number, updates: Partial<InsertUserProfile>): Promise<UserProfile> {
  const db = await getDb();
  if (!db) {
    if (!ENV.azureSqlConnectionString) {
      throw new Error("Database is not available");
    }

    const filteredUpdates = Object.fromEntries(
      Object.entries(updates)
        .filter(([key, value]) => value !== undefined)
    ) as Partial<InsertUserProfile>;

    try {
      const pool = await getAzureSqlPool();

      await pool.request().query(`
IF OBJECT_ID(N'dbo.user_profiles', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[user_profiles] (
    [id] INT IDENTITY(1,1) PRIMARY KEY,
    [userId] INT NOT NULL UNIQUE,
    [heightIn] INT NULL,
    [weightLbs] INT NULL,
    [ageYears] INT NULL,
    [fitnessGoal] NVARCHAR(32) NULL,
    [goalWeightLbs] INT NULL,
    [goalDate] BIGINT NULL,
    [dailyCalorieTarget] INT NULL,
    [dailyProteinTarget] INT NULL,
    [dailyCarbsTarget] INT NULL,
    [dailyFatTarget] INT NULL,
    [cgmAverageGlucose] INT NULL,
    [cgmTimeInRange] FLOAT NULL,
    [cgmA1cEstimate] FLOAT NULL,
    [activityLevel] NVARCHAR(32) NULL DEFAULT 'moderately_active',
    [diabetesType] NVARCHAR(32) NULL,
    [createdAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    [updatedAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END
      `);

      await pool.request().query(`
IF COL_LENGTH('dbo.user_profiles', 'goalWeightLbs') IS NULL
  ALTER TABLE [dbo].[user_profiles] ADD [goalWeightLbs] INT NULL;
IF COL_LENGTH('dbo.user_profiles', 'goalDate') IS NULL
  ALTER TABLE [dbo].[user_profiles] ADD [goalDate] BIGINT NULL;
IF COL_LENGTH('dbo.user_profiles', 'dailyCalorieTarget') IS NULL
  ALTER TABLE [dbo].[user_profiles] ADD [dailyCalorieTarget] INT NULL;
IF COL_LENGTH('dbo.user_profiles', 'dailyProteinTarget') IS NULL
  ALTER TABLE [dbo].[user_profiles] ADD [dailyProteinTarget] INT NULL;
IF COL_LENGTH('dbo.user_profiles', 'dailyCarbsTarget') IS NULL
  ALTER TABLE [dbo].[user_profiles] ADD [dailyCarbsTarget] INT NULL;
IF COL_LENGTH('dbo.user_profiles', 'dailyFatTarget') IS NULL
  ALTER TABLE [dbo].[user_profiles] ADD [dailyFatTarget] INT NULL;
IF COL_LENGTH('dbo.user_profiles', 'cgmAverageGlucose') IS NULL
  ALTER TABLE [dbo].[user_profiles] ADD [cgmAverageGlucose] INT NULL;
IF COL_LENGTH('dbo.user_profiles', 'cgmTimeInRange') IS NULL
  ALTER TABLE [dbo].[user_profiles] ADD [cgmTimeInRange] FLOAT NULL;
IF COL_LENGTH('dbo.user_profiles', 'cgmA1cEstimate') IS NULL
  ALTER TABLE [dbo].[user_profiles] ADD [cgmA1cEstimate] FLOAT NULL;
IF COL_LENGTH('dbo.user_profiles', 'activityLevel') IS NULL
  ALTER TABLE [dbo].[user_profiles] ADD [activityLevel] NVARCHAR(32) NULL DEFAULT 'moderately_active';
IF COL_LENGTH('dbo.user_profiles', 'diabetesType') IS NULL
  ALTER TABLE [dbo].[user_profiles] ADD [diabetesType] NVARCHAR(32) NULL;
      `);

      const existsResult = await pool
        .request()
        .input("userId", userId)
        .query<{ found: number }>("SELECT TOP 1 1 AS [found] FROM [dbo].[user_profiles] WHERE [userId] = @userId");

      const exists = Boolean(existsResult.recordset?.[0]?.found);

      if (exists) {
        if (Object.keys(filteredUpdates).length > 0) {
          const request = pool.request().input("userId", userId);
          const setClauses: string[] = [];

          for (const [key, value] of Object.entries(filteredUpdates)) {
            if (key === "userId" || key === "id") continue;
            request.input(key, value ?? null);
            setClauses.push(`[${key}] = @${key}`);
          }

          if (setClauses.length > 0) {
            setClauses.push("[updatedAt] = SYSUTCDATETIME()");
            await request.query(
              `UPDATE [dbo].[user_profiles] SET ${setClauses.join(", ")} WHERE [userId] = @userId`
            );
          }
        }
      } else {
        const request = pool.request().input("userId", userId);
        const columns = ["[userId]"];
        const values = ["@userId"];

        for (const [key, value] of Object.entries(filteredUpdates)) {
          if (key === "userId" || key === "id") continue;
          request.input(key, value ?? null);
          columns.push(`[${key}]`);
          values.push(`@${key}`);
        }

        await request.query(
          `INSERT INTO [dbo].[user_profiles] (${columns.join(", ")}) VALUES (${values.join(", ")})`
        );
      }

      const profile = await getUserProfile(userId);
      if (!profile) throw new Error("Failed to upsert user profile");
      return profile;
    } catch (error) {
      console.warn("[Database] Error upserting user profile (Azure SQL):", error);
      throw new Error("Failed to save profile");
    }
  }

  // Filter out undefined values
  const filteredUpdates = Object.fromEntries(
    Object.entries(updates)
      .filter(([key, value]) => value !== undefined)
  ) as Partial<InsertUserProfile>;

  const existing = await getUserProfile(userId);

  if (existing) {
    // Only update if there are values to set
    if (Object.keys(filteredUpdates).length > 0) {
      await db
        .update(userProfiles)
        .set(filteredUpdates)
        .where(eq(userProfiles.userId, userId));
    }
    // If no values to update, that's OK - just return existing profile
  } else {
    const insert: InsertUserProfile = {
      userId,
      ...filteredUpdates,
    };
    await db.insert(userProfiles).values(insert);
  }

  const result = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  if (!result || result.length === 0) throw new Error("Failed to upsert user profile");
  return result[0];
}

// Food Logging Functions
export async function addFoodLog(userId: number, log: Omit<InsertFoodLog, "userId">): Promise<FoodLog> {
  const db = await getDb();
  if (!db) {
    if (!ENV.azureSqlConnectionString) {
      throw new Error("Database is not available");
    }

    try {
      const pool = await getAzureSqlPool();
      await pool.request().query(`
IF OBJECT_ID(N'dbo.food_logs', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[food_logs] (
    [id] INT IDENTITY(1,1) PRIMARY KEY,
    [userId] INT NOT NULL,
    [foodName] NVARCHAR(191) NOT NULL,
    [servingSize] NVARCHAR(120) NULL,
    [calories] INT NOT NULL,
    [proteinGrams] FLOAT NOT NULL,
    [carbsGrams] FLOAT NOT NULL,
    [fatGrams] FLOAT NOT NULL,
    [loggedAt] BIGINT NOT NULL,
    [mealType] NVARCHAR(32) NOT NULL DEFAULT 'other',
    [notes] NVARCHAR(MAX) NULL,
    [createdAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX [idx_food_logs_userId_loggedAt] ON [dbo].[food_logs] ([userId], [loggedAt] DESC);
END
      `);

      await pool
        .request()
        .input("userId", userId)
        .input("foodName", log.foodName)
        .input("servingSize", log.servingSize ?? null)
        .input("calories", log.calories)
        .input("proteinGrams", log.proteinGrams)
        .input("carbsGrams", log.carbsGrams)
        .input("fatGrams", log.fatGrams)
        .input("loggedAt", log.loggedAt)
        .input("mealType", log.mealType ?? "other")
        .input("notes", log.notes ?? null)
        .query(`
INSERT INTO [dbo].[food_logs]
  ([userId], [foodName], [servingSize], [calories], [proteinGrams], [carbsGrams], [fatGrams], [loggedAt], [mealType], [notes])
VALUES
  (@userId, @foodName, @servingSize, @calories, @proteinGrams, @carbsGrams, @fatGrams, @loggedAt, @mealType, @notes)
        `);

      const createdResult = await pool
        .request()
        .input("userId", userId)
        .query<any>(`
SELECT TOP 1
  [id], [userId], [foodName], [servingSize], [calories], [proteinGrams], [carbsGrams], [fatGrams], [loggedAt], [mealType], [notes], [createdAt]
FROM [dbo].[food_logs]
WHERE [userId] = @userId
ORDER BY [id] DESC
        `);

      const row = createdResult.recordset?.[0];
      if (!row) throw new Error("Failed to create food log");

      return {
        id: row.id,
        userId: row.userId,
        foodName: row.foodName,
        servingSize: row.servingSize,
        calories: row.calories,
        proteinGrams: row.proteinGrams,
        carbsGrams: row.carbsGrams,
        fatGrams: row.fatGrams,
        loggedAt: row.loggedAt,
        mealType: row.mealType,
        notes: row.notes,
        createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
      } as FoodLog;
    } catch (error) {
      console.warn("[Database] Error adding food log (Azure SQL):", error);
      throw new Error("Failed to save food log");
    }
  }

  const newLog: InsertFoodLog = {
    userId,
    ...log,
  };

  await db.insert(foodLogs).values(newLog);

  const created = await db
    .select()
    .from(foodLogs)
    .where(eq(foodLogs.userId, userId))
    .orderBy((t) => desc(t.loggedAt))
    .limit(1);

  if (!created || created.length === 0) throw new Error("Failed to create food log");
  return created[0];
}

export async function getFoodLogsForDay(userId: number, startOfDay: number, endOfDay: number): Promise<FoodLog[]> {
  const db = await getDb();
  if (!db) {
    if (!ENV.azureSqlConnectionString) {
      console.warn("[Database] Cannot get food logs: database not available");
      return [];
    }

    try {
      const pool = await getAzureSqlPool();
      await pool.request().query(`
IF OBJECT_ID(N'dbo.food_logs', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[food_logs] (
    [id] INT IDENTITY(1,1) PRIMARY KEY,
    [userId] INT NOT NULL,
    [foodName] NVARCHAR(191) NOT NULL,
    [servingSize] NVARCHAR(120) NULL,
    [calories] INT NOT NULL,
    [proteinGrams] FLOAT NOT NULL,
    [carbsGrams] FLOAT NOT NULL,
    [fatGrams] FLOAT NOT NULL,
    [loggedAt] BIGINT NOT NULL,
    [mealType] NVARCHAR(32) NOT NULL DEFAULT 'other',
    [notes] NVARCHAR(MAX) NULL,
    [createdAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX [idx_food_logs_userId_loggedAt] ON [dbo].[food_logs] ([userId], [loggedAt] DESC);
END
      `);

      const result = await pool
        .request()
        .input("userId", userId)
        .input("startOfDay", startOfDay)
        .input("endOfDay", endOfDay)
        .query<any>(`
SELECT
  [id], [userId], [foodName], [servingSize], [calories], [proteinGrams], [carbsGrams], [fatGrams], [loggedAt], [mealType], [notes], [createdAt]
FROM [dbo].[food_logs]
WHERE [userId] = @userId
  AND [loggedAt] >= @startOfDay
  AND [loggedAt] <= @endOfDay
ORDER BY [loggedAt] DESC
        `);

      return (result.recordset || []).map((row: any) => ({
        id: row.id,
        userId: row.userId,
        foodName: row.foodName,
        servingSize: row.servingSize,
        calories: row.calories,
        proteinGrams: row.proteinGrams,
        carbsGrams: row.carbsGrams,
        fatGrams: row.fatGrams,
        loggedAt: row.loggedAt,
        mealType: row.mealType,
        notes: row.notes,
        createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
      })) as FoodLog[];
    } catch (error) {
      console.warn("[Database] Error getting food logs (Azure SQL):", error);
      return [];
    }
  }

  return db
    .select()
    .from(foodLogs)
    .where(
      and(
        eq(foodLogs.userId, userId),
        gte(foodLogs.loggedAt, startOfDay),
        lte(foodLogs.loggedAt, endOfDay)
      )
    )
    .orderBy((t) => desc(t.loggedAt));
}

export async function getRecentFoods(userId: number, limit: number = 5): Promise<FoodLog[]> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get recent foods: database not available");
    return [];
  }

  return db
    .select()
    .from(foodLogs)
    .where(eq(foodLogs.userId, userId))
    .orderBy((t) => desc(t.loggedAt))
    .limit(limit);
}

export async function deleteFoodLog(foodLogId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    if (!ENV.azureSqlConnectionString) {
      throw new Error("Database is not available");
    }

    try {
      const pool = await getAzureSqlPool();
      await pool
        .request()
        .input("foodLogId", foodLogId)
        .input("userId", userId)
        .query(`DELETE FROM [dbo].[food_logs] WHERE [id] = @foodLogId AND [userId] = @userId`);
      return true;
    } catch (error) {
      console.warn("[Database] Error deleting food log (Azure SQL):", error);
      throw new Error("Failed to delete food log");
    }
  }

  await db.delete(foodLogs).where(and(eq(foodLogs.id, foodLogId), eq(foodLogs.userId, userId)));
  return true;
}

export async function updateFoodLog(foodLogId: number, userId: number, updates: Partial<Omit<InsertFoodLog, "userId">>): Promise<FoodLog> {
  const db = await getDb();
  if (!db) {
    if (!ENV.azureSqlConnectionString) {
      throw new Error("Database is not available");
    }

    try {
      const filteredUpdates = Object.fromEntries(
        Object.entries(updates).filter(([, value]) => value !== undefined)
      ) as Partial<Omit<InsertFoodLog, "userId">>;

      if (Object.keys(filteredUpdates).length > 0) {
        const pool = await getAzureSqlPool();
        const request = pool.request().input("foodLogId", foodLogId).input("userId", userId);
        const setClauses: string[] = [];

        for (const [key, value] of Object.entries(filteredUpdates)) {
          request.input(key, value ?? null);
          setClauses.push(`[${key}] = @${key}`);
        }

        await request.query(`
UPDATE [dbo].[food_logs]
SET ${setClauses.join(", ")}
WHERE [id] = @foodLogId AND [userId] = @userId
        `);

        const updatedResult = await pool
          .request()
          .input("foodLogId", foodLogId)
          .query<any>(`
SELECT TOP 1
  [id], [userId], [foodName], [servingSize], [calories], [proteinGrams], [carbsGrams], [fatGrams], [loggedAt], [mealType], [notes], [createdAt]
FROM [dbo].[food_logs]
WHERE [id] = @foodLogId
          `);

        const row = updatedResult.recordset?.[0];
        if (!row) throw new Error("Failed to update food log");

        return {
          id: row.id,
          userId: row.userId,
          foodName: row.foodName,
          servingSize: row.servingSize,
          calories: row.calories,
          proteinGrams: row.proteinGrams,
          carbsGrams: row.carbsGrams,
          fatGrams: row.fatGrams,
          loggedAt: row.loggedAt,
          mealType: row.mealType,
          notes: row.notes,
          createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
        } as FoodLog;
      }

      const pool = await getAzureSqlPool();
      const unchangedResult = await pool
        .request()
        .input("foodLogId", foodLogId)
        .query<any>(`
SELECT TOP 1
  [id], [userId], [foodName], [servingSize], [calories], [proteinGrams], [carbsGrams], [fatGrams], [loggedAt], [mealType], [notes], [createdAt]
FROM [dbo].[food_logs]
WHERE [id] = @foodLogId
        `);
      const unchanged = unchangedResult.recordset?.[0];
      if (!unchanged) throw new Error("Failed to update food log");
      return {
        id: unchanged.id,
        userId: unchanged.userId,
        foodName: unchanged.foodName,
        servingSize: unchanged.servingSize,
        calories: unchanged.calories,
        proteinGrams: unchanged.proteinGrams,
        carbsGrams: unchanged.carbsGrams,
        fatGrams: unchanged.fatGrams,
        loggedAt: unchanged.loggedAt,
        mealType: unchanged.mealType,
        notes: unchanged.notes,
        createdAt: unchanged.createdAt ? new Date(unchanged.createdAt) : new Date(),
      } as FoodLog;
    } catch (error) {
      console.warn("[Database] Error updating food log (Azure SQL):", error);
      throw new Error("Failed to update food log");
    }
  }

  await db
    .update(foodLogs)
    .set(updates)
    .where(and(eq(foodLogs.id, foodLogId), eq(foodLogs.userId, userId)));

  const updated = await db.select().from(foodLogs).where(eq(foodLogs.id, foodLogId)).limit(1);
  if (!updated || updated.length === 0) throw new Error("Failed to update food log");
  return updated[0];
}

// Favorite Foods Functions
export async function addFavoriteFood(userId: number, food: Omit<InsertFavoriteFood, "userId">): Promise<FavoriteFood> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database is not available");
  }

  const newFood: InsertFavoriteFood = {
    userId,
    ...food,
  };

  await db.insert(favoriteFoods).values(newFood);

  const created = await db
    .select()
    .from(favoriteFoods)
    .where(eq(favoriteFoods.userId, userId))
    .orderBy((t) => desc(t.createdAt))
    .limit(1);

  if (!created || created.length === 0) throw new Error("Failed to create favorite food");
  return created[0];
}

export async function getFavoriteFoods(userId: number): Promise<FavoriteFood[]> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get favorite foods: database not available");
    return [];
  }

  return db.select().from(favoriteFoods).where(eq(favoriteFoods.userId, userId)).orderBy((t) => desc(t.createdAt));
}

export async function deleteFavoriteFood(favoriteFoodId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database is not available");
  }

  await db.delete(favoriteFoods).where(and(eq(favoriteFoods.id, favoriteFoodId), eq(favoriteFoods.userId, userId)));
  return true;
}

// Meal Templates Functions
export async function createMealTemplate(userId: number, meal: Omit<InsertMealTemplate, 'userId'>): Promise<MealTemplate> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database is not available");
  }

  const newMeal: InsertMealTemplate = {
    userId,
    mealName: meal.mealName,
    mealType: meal.mealType || "other",
    foods: meal.foods,
    totalCalories: meal.totalCalories,
    totalProteinGrams: meal.totalProteinGrams,
    totalCarbsGrams: meal.totalCarbsGrams,
    totalFatGrams: meal.totalFatGrams,
    notes: meal.notes,
  };

  const result = await db.insert(mealTemplates).values(newMeal);
  
  const created = await db.select().from(mealTemplates).where(eq(mealTemplates.userId, userId)).orderBy((t) => desc(t.createdAt)).limit(1);
  if (!created || created.length === 0) throw new Error("Failed to create meal template");
  return created[0];
}

export async function getMealTemplates(userId: number): Promise<MealTemplate[]> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get meal templates: database not available");
    return [];
  }

  return db.select().from(mealTemplates).where(eq(mealTemplates.userId, userId)).orderBy((t) => desc(t.createdAt));
}

export async function getMealTemplate(mealTemplateId: number, userId: number): Promise<MealTemplate | null> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database is not available");
  }

  const result = await db.select().from(mealTemplates).where(and(eq(mealTemplates.id, mealTemplateId), eq(mealTemplates.userId, userId))).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function updateMealTemplate(
  mealTemplateId: number,
  userId: number,
  updates: Partial<Omit<InsertMealTemplate, 'userId'>>
): Promise<MealTemplate> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database is not available");
  }

  await db
    .update(mealTemplates)
    .set(updates)
    .where(and(eq(mealTemplates.id, mealTemplateId), eq(mealTemplates.userId, userId)));

  const updated = await db.select().from(mealTemplates).where(eq(mealTemplates.id, mealTemplateId)).limit(1);
  if (!updated || updated.length === 0) throw new Error("Failed to update meal template");
  return updated[0];
}

export async function deleteMealTemplate(mealTemplateId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database is not available");
  }

  await db.delete(mealTemplates).where(and(eq(mealTemplates.id, mealTemplateId), eq(mealTemplates.userId, userId)));
  return true;
}

// Progress Tracking Functions
export interface DailyMacroStats {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  calorieTarget?: number;
  proteinTarget?: number;
  carbsTarget?: number;
  fatTarget?: number;
}

export interface MacroTrend {
  dailyStats: DailyMacroStats[];
  weeklyAverages: {
    week: string;
    avgCalories: number;
    avgProtein: number;
    avgCarbs: number;
    avgFat: number;
  }[];
  monthlyAverages: {
    month: string;
    avgCalories: number;
    avgProtein: number;
    avgCarbs: number;
    avgFat: number;
  }[];
  consistencyMetrics: {
    daysTracked: number;
    daysHitCalorieTarget: number;
    daysHitProteinTarget: number;
    daysHitCarbsTarget: number;
    daysHitFatTarget: number;
    adherenceRate: number; // percentage
  };
}

export async function getMacroTrends(userId: number, startDate: number, endDate: number): Promise<MacroTrend> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database is not available");
  }

  // Get user profile for targets
  const profile = await getUserProfile(userId);
  const calorieTarget = profile?.dailyCalorieTarget || 2000;
  const proteinTarget = profile?.dailyProteinTarget || 150;
  const carbsTarget = profile?.dailyCarbsTarget || 200;
  const fatTarget = profile?.dailyFatTarget || 65;

  // Get all food logs in date range
  const logs = await db
    .select()
    .from(foodLogs)
    .where(
      and(
        eq(foodLogs.userId, userId),
        gte(foodLogs.loggedAt, startDate),
        lte(foodLogs.loggedAt, endDate)
      )
    )
    .orderBy(foodLogs.loggedAt);

  // Group by day and calculate totals
  const dailyMap = new Map<string, DailyMacroStats>();

  logs.forEach((log) => {
    const date = new Date(log.loggedAt);
    const dateStr = date.toISOString().split('T')[0];

    if (!dailyMap.has(dateStr)) {
      dailyMap.set(dateStr, {
        date: dateStr,
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        calorieTarget,
        proteinTarget,
        carbsTarget,
        fatTarget,
      });
    }

    const daily = dailyMap.get(dateStr)!;
    daily.calories += log.calories;
    daily.protein += log.proteinGrams;
    daily.carbs += log.carbsGrams;
    daily.fat += log.fatGrams;
  });

  const dailyStats = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  // Calculate weekly averages
  const weeklyMap = new Map<string, { stats: DailyMacroStats[]; week: string }>();
  dailyStats.forEach((stat) => {
    const date = new Date(stat.date);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay());
    const weekStr = weekStart.toISOString().split('T')[0];

    if (!weeklyMap.has(weekStr)) {
      weeklyMap.set(weekStr, { stats: [], week: weekStr });
    }
    weeklyMap.get(weekStr)!.stats.push(stat);
  });

  const weeklyAverages = Array.from(weeklyMap.values()).map(({ stats, week }) => ({
    week,
    avgCalories: Math.round(stats.reduce((sum, s) => sum + s.calories, 0) / stats.length),
    avgProtein: Math.round(stats.reduce((sum, s) => sum + s.protein, 0) / stats.length),
    avgCarbs: Math.round(stats.reduce((sum, s) => sum + s.carbs, 0) / stats.length),
    avgFat: Math.round(stats.reduce((sum, s) => sum + s.fat, 0) / stats.length),
  }));

  // Calculate monthly averages
  const monthlyMap = new Map<string, { stats: DailyMacroStats[]; month: string }>();
  dailyStats.forEach((stat) => {
    const date = new Date(stat.date);
    const monthStr = date.toISOString().slice(0, 7); // YYYY-MM

    if (!monthlyMap.has(monthStr)) {
      monthlyMap.set(monthStr, { stats: [], month: monthStr });
    }
    monthlyMap.get(monthStr)!.stats.push(stat);
  });

  const monthlyAverages = Array.from(monthlyMap.values()).map(({ stats, month }) => ({
    month,
    avgCalories: Math.round(stats.reduce((sum, s) => sum + s.calories, 0) / stats.length),
    avgProtein: Math.round(stats.reduce((sum, s) => sum + s.protein, 0) / stats.length),
    avgCarbs: Math.round(stats.reduce((sum, s) => sum + s.carbs, 0) / stats.length),
    avgFat: Math.round(stats.reduce((sum, s) => sum + s.fat, 0) / stats.length),
  }));

  // Calculate consistency metrics
  const daysTracked = dailyStats.length;
  let daysHitCalorieTarget = 0;
  let daysHitProteinTarget = 0;
  let daysHitCarbsTarget = 0;
  let daysHitFatTarget = 0;

  dailyStats.forEach((stat) => {
    // Allow 10% margin for calorie target
    if (stat.calories >= calorieTarget * 0.9 && stat.calories <= calorieTarget * 1.1) {
      daysHitCalorieTarget++;
    }
    // Allow 10% margin for protein target
    if (stat.protein >= proteinTarget * 0.9 && stat.protein <= proteinTarget * 1.1) {
      daysHitProteinTarget++;
    }
    // Allow 10% margin for carbs target
    if (stat.carbs >= carbsTarget * 0.9 && stat.carbs <= carbsTarget * 1.1) {
      daysHitCarbsTarget++;
    }
    // Allow 10% margin for fat target
    if (stat.fat >= fatTarget * 0.9 && stat.fat <= fatTarget * 1.1) {
      daysHitFatTarget++;
    }
  });

  const adherenceRate = daysTracked > 0 
    ? Math.round(((daysHitCalorieTarget + daysHitProteinTarget + daysHitCarbsTarget + daysHitFatTarget) / (daysTracked * 4)) * 100)
    : 0;

  return {
    dailyStats,
    weeklyAverages,
    monthlyAverages,
    consistencyMetrics: {
      daysTracked,
      daysHitCalorieTarget,
      daysHitProteinTarget,
      daysHitCarbsTarget,
      daysHitFatTarget,
      adherenceRate,
    },
  };
}

// Goal Tracking Functions
export interface GoalProgress {
  currentWeight: number;
  goalWeight: number;
  startWeight: number;
  weightLost: number;
  weightToGo: number;
  progressPercentage: number;
  daysElapsed: number;
  daysRemaining: number;
  estimatedCompletionDate: Date | null;
  weeklyWeightChangeRate: number; // kg per week
  isOnTrack: boolean;
  daysUntilCompletion: number | null;
  fitnessGoal: string;
}

export async function getGoalProgress(userId: number): Promise<GoalProgress | null> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database is not available");
  }

  const profile = await getUserProfile(userId);
  if (!profile || !profile.goalWeightLbs || !profile.goalDate || !profile.weightLbs) {
    return null;
  }

  const goalWeight = profile.goalWeightLbs;
  const now = new Date();
  
  // Handle goalDate which is stored as a number (timestamp in milliseconds)
  const goalDate = new Date(profile.goalDate);
  
  // Get weight history from weight_entries table
  const weightEntries = await getWeightEntries(userId, 365); // Get up to 1 year of history
  
  let startWeight = profile.weightLbs;
  let currentWeight = profile.weightLbs;
  
  if (weightEntries.length > 0) {
    // Sort entries by date to find earliest and latest
    const sorted = [...weightEntries].sort((a, b) => a.recordedAt - b.recordedAt);
    startWeight = sorted[0].weightLbs; // Earliest entry
    currentWeight = sorted[sorted.length - 1].weightLbs; // Most recent entry
  }
  
  // Calculate progress
  const weightLost = startWeight - currentWeight;
  const weightToGo = Math.abs(goalWeight - currentWeight);
  const totalWeightNeeded = Math.abs(goalWeight - startWeight);
  const progressPercentage = totalWeightNeeded > 0 
    ? Math.round(((startWeight - currentWeight) / totalWeightNeeded) * 100)
    : 0;

  const createdAtTime = profile.createdAt instanceof Date 
    ? profile.createdAt.getTime() 
    : new Date(profile.createdAt).getTime();
  
  const daysElapsed = Math.floor((now.getTime() - createdAtTime) / (1000 * 60 * 60 * 24));
  const daysRemaining = Math.floor((goalDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  // Calculate weekly weight change rate
  const weeklyWeightChangeRate = daysElapsed > 0 
    ? (weightLost / (daysElapsed / 7))
    : 0;

  // Estimate completion date based on current rate
  let estimatedCompletionDate: Date | null = null;
  let daysUntilCompletion: number | null = null;
  
  if (weeklyWeightChangeRate !== 0) {
    const weeksNeeded = Math.abs(weightToGo / weeklyWeightChangeRate);
    const daysNeeded = Math.ceil(weeksNeeded * 7);
    estimatedCompletionDate = new Date(now.getTime() + daysNeeded * 24 * 60 * 60 * 1000);
    daysUntilCompletion = daysNeeded;
  }

  // Check if on track (estimated completion before goal date)
  const isOnTrack = estimatedCompletionDate 
    ? estimatedCompletionDate.getTime() <= goalDate.getTime()
    : daysRemaining > 0;

  return {
    currentWeight,
    goalWeight,
    startWeight,
    weightLost,
    weightToGo,
    progressPercentage: Math.max(0, Math.min(100, progressPercentage)),
    daysElapsed,
    daysRemaining,
    estimatedCompletionDate,
    weeklyWeightChangeRate,
    isOnTrack,
    daysUntilCompletion,
    fitnessGoal: profile.fitnessGoal || "maintain",
  };
}

export async function getWeightHistory(userId: number, days: number = 90): Promise<Array<{ date: string; weight: number }>> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database is not available");
  }

  const profile = await getUserProfile(userId);
  if (!profile || !profile.weightLbs) {
    return [];
  }

  // For now, return a simple array with just the current weight
  // In a real app, you'd track weight measurements over time
  const now = new Date();
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  return [
    {
      date: startDate.toISOString().split('T')[0],
      weight: profile.weightLbs,
    },
    {
      date: now.toISOString().split('T')[0],
      weight: profile.weightLbs,
    },
  ];
}

export async function getCachedFoodSearchResults(query: string): Promise<FoodSearchCache[]> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get cached food search: database not available");
    return [];
  }

  const now = new Date();
  const results = await db
    .select()
    .from(foodSearchCache)
    .where(and(eq(foodSearchCache.searchQuery, query.toLowerCase()), gte(foodSearchCache.expiresAt, now)))
    .orderBy(desc(foodSearchCache.createdAt))
    .limit(10);

  return results;
}

export async function cacheFoodSearchResults(query: string, foods: Omit<InsertFoodSearchCache, "searchQuery" | "createdAt" | "expiresAt">[]): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot cache food search: database not available");
    return;
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30); // Cache for 30 days

  const cachesToInsert: InsertFoodSearchCache[] = foods.map(food => ({
    searchQuery: query.toLowerCase(),
    ...food,
    createdAt: new Date(),
    expiresAt,
  }));

  try {
    // Delete old cached results for this query before inserting fresh ones
    await db.delete(foodSearchCache).where(eq(foodSearchCache.searchQuery, query.toLowerCase()));
    await db.insert(foodSearchCache).values(cachesToInsert);
  } catch (error) {
    console.warn("[Database] Error caching food search results:", error);
  }
}

export async function cleanupExpiredCache(): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot cleanup cache: database not available");
    return;
  }

  const now = new Date();
  try {
    await db.delete(foodSearchCache).where(lt(foodSearchCache.expiresAt, now));
  } catch (error) {
    console.warn("[Database] Error cleaning up expired cache:", error);
  }
}

// Progress Photos Functions
export async function addProgressPhoto(userId: number, photo: Omit<InsertProgressPhoto, "userId">): Promise<ProgressPhoto> {
  const db = await getDb();
  if (!db) {
    if (!ENV.azureSqlConnectionString) {
      throw new Error("Database is not available");
    }

    try {
      const pool = await getAzureSqlPool();
      await pool.request().query(`
IF OBJECT_ID(N'dbo.progress_photos', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[progress_photos] (
    [id] INT IDENTITY(1,1) PRIMARY KEY,
    [userId] INT NOT NULL,
    [photoUrl] NVARCHAR(MAX) NOT NULL,
    [photoKey] NVARCHAR(255) NOT NULL,
    [photoName] NVARCHAR(191) NOT NULL,
    [photoDate] BIGINT NOT NULL,
    [description] NVARCHAR(MAX) NULL,
    [createdAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    [updatedAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX [idx_progress_photos_userId_photoDate] ON [dbo].[progress_photos] ([userId], [photoDate] DESC);
END
      `);

      await pool
        .request()
        .input("userId", userId)
        .input("photoUrl", photo.photoUrl)
        .input("photoKey", photo.photoKey)
        .input("photoName", photo.photoName)
        .input("photoDate", photo.photoDate)
        .input("description", photo.description ?? null)
        .query(`
INSERT INTO [dbo].[progress_photos]
  ([userId], [photoUrl], [photoKey], [photoName], [photoDate], [description])
VALUES
  (@userId, @photoUrl, @photoKey, @photoName, @photoDate, @description)
        `);

      const created = await pool
        .request()
        .input("userId", userId)
        .query<any>(`
SELECT TOP 1 [id], [userId], [photoUrl], [photoKey], [photoName], [photoDate], [description], [createdAt], [updatedAt]
FROM [dbo].[progress_photos]
WHERE [userId] = @userId
ORDER BY [photoDate] DESC, [id] DESC
        `);

      const row = created.recordset?.[0];
      if (!row) throw new Error("Failed to create progress photo");

      return {
        id: row.id,
        userId: row.userId,
        photoUrl: row.photoUrl,
        photoKey: row.photoKey,
        photoName: row.photoName,
        photoDate: Number(row.photoDate),
        description: row.description,
        createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
        updatedAt: row.updatedAt ? new Date(row.updatedAt) : new Date(),
      } as ProgressPhoto;
    } catch (error) {
      console.error("[Database] Error creating progress photo (Azure SQL):", error);
      throw new Error("Failed to create progress photo");
    }
  }

  const newPhoto: InsertProgressPhoto = {
    userId,
    ...photo,
  };

  await db.insert(progressPhotos).values(newPhoto);

  const created = await db
    .select()
    .from(progressPhotos)
    .where(eq(progressPhotos.userId, userId))
    .orderBy((t) => desc(t.photoDate))
    .limit(1);

  if (!created || created.length === 0) throw new Error("Failed to create progress photo");
  return created[0];
}

export async function getProgressPhotos(userId: number): Promise<ProgressPhoto[]> {
  const db = await getDb();
  if (!db) {
    if (!ENV.azureSqlConnectionString) {
      console.warn("[Database] Cannot get progress photos: database not available");
      return [];
    }

    try {
      const pool = await getAzureSqlPool();
      const rows = await pool
        .request()
        .input("userId", userId)
        .query<any>(`
SELECT [id], [userId], [photoUrl], [photoKey], [photoName], [photoDate], [description], [createdAt], [updatedAt]
FROM [dbo].[progress_photos]
WHERE [userId] = @userId
ORDER BY [photoDate] DESC, [id] DESC
        `);

      const { storageGet } = await import("./storage");
      const withSasUrls = await Promise.all(
        (rows.recordset || []).map(async (row: any) => {
          try {
            const { url } = await storageGet(row.photoKey);
            return {
              id: row.id,
              userId: row.userId,
              photoUrl: url,
              photoKey: row.photoKey,
              photoName: row.photoName,
              photoDate: Number(row.photoDate),
              description: row.description,
              createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
              updatedAt: row.updatedAt ? new Date(row.updatedAt) : new Date(),
            } as ProgressPhoto;
          } catch {
            return {
              id: row.id,
              userId: row.userId,
              photoUrl: row.photoUrl,
              photoKey: row.photoKey,
              photoName: row.photoName,
              photoDate: Number(row.photoDate),
              description: row.description,
              createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
              updatedAt: row.updatedAt ? new Date(row.updatedAt) : new Date(),
            } as ProgressPhoto;
          }
        })
      );

      return withSasUrls;
    } catch (error) {
      console.error("[Database] Error fetching progress photos (Azure SQL):", error);
      return [];
    }
  }

  try {
    const { storageGet } = await import("./storage");
    const photos = await db.select().from(progressPhotos).where(eq(progressPhotos.userId, userId)).orderBy((t) => desc(t.photoDate));
    
    // Generate SAS URLs for each photo
    const photosWithUrls = await Promise.all(
      photos.map(async (photo) => {
        try {
          const { url } = await storageGet(photo.photoKey);
          return { ...photo, photoUrl: url };
        } catch (error) {
          console.error("[Storage] Error generating SAS URL for photo:", error);
          return photo;
        }
      })
    );
    
    return photosWithUrls;
  } catch (error) {
    console.error("[Database] Error fetching progress photos:", error);
    return [];
  }
}

export async function deleteProgressPhoto(photoId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    if (!ENV.azureSqlConnectionString) {
      throw new Error("Database is not available");
    }

    try {
      const pool = await getAzureSqlPool();
      const result = await pool
        .request()
        .input("photoId", photoId)
        .input("userId", userId)
        .query(`DELETE FROM [dbo].[progress_photos] WHERE [id] = @photoId AND [userId] = @userId`);
      return (result.rowsAffected?.[0] || 0) > 0;
    } catch (error) {
      console.error("[Database] Error deleting progress photo (Azure SQL):", error);
      throw new Error("Failed to delete progress photo");
    }
  }

  await db.delete(progressPhotos).where(and(eq(progressPhotos.id, photoId), eq(progressPhotos.userId, userId)));
  return true;
}

export async function updateProgressPhoto(
  photoId: number,
  userId: number,
  updates: Partial<Omit<InsertProgressPhoto, "userId">>
): Promise<ProgressPhoto> {
  const db = await getDb();
  if (!db) {
    if (!ENV.azureSqlConnectionString) {
      throw new Error("Database is not available");
    }

    try {
      const pool = await getAzureSqlPool();
      const request = pool.request().input("photoId", photoId).input("userId", userId);
      const setClauses: string[] = [];

      if (updates.photoName !== undefined) {
        request.input("photoName", updates.photoName ?? null);
        setClauses.push("[photoName] = @photoName");
      }
      if (updates.photoDate !== undefined) {
        request.input("photoDate", updates.photoDate ?? null);
        setClauses.push("[photoDate] = @photoDate");
      }
      if (updates.description !== undefined) {
        request.input("description", updates.description ?? null);
        setClauses.push("[description] = @description");
      }

      if (setClauses.length > 0) {
        setClauses.push("[updatedAt] = SYSUTCDATETIME()");
        await request.query(
          `UPDATE [dbo].[progress_photos] SET ${setClauses.join(", ")} WHERE [id] = @photoId AND [userId] = @userId`
        );
      }

      const result = await pool
        .request()
        .input("photoId", photoId)
        .query<any>(`
SELECT TOP 1 [id], [userId], [photoUrl], [photoKey], [photoName], [photoDate], [description], [createdAt], [updatedAt]
FROM [dbo].[progress_photos]
WHERE [id] = @photoId
        `);

      const row = result.recordset?.[0];
      if (!row) throw new Error("Failed to update progress photo");

      return {
        id: row.id,
        userId: row.userId,
        photoUrl: row.photoUrl,
        photoKey: row.photoKey,
        photoName: row.photoName,
        photoDate: Number(row.photoDate),
        description: row.description,
        createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
        updatedAt: row.updatedAt ? new Date(row.updatedAt) : new Date(),
      } as ProgressPhoto;
    } catch (error) {
      console.error("[Database] Error updating progress photo (Azure SQL):", error);
      throw new Error("Failed to update progress photo");
    }
  }

  await db
    .update(progressPhotos)
    .set(updates)
    .where(and(eq(progressPhotos.id, photoId), eq(progressPhotos.userId, userId)));

  const updated = await db.select().from(progressPhotos).where(eq(progressPhotos.id, photoId)).limit(1);
  if (!updated || updated.length === 0) throw new Error("Failed to update progress photo");
  return updated[0];
}


// Glucose Readings Functions

async function ensureGlucoseInfrastructureAzureSql() {
  const pool = await getAzureSqlPool();
  await pool.request().query(`
IF OBJECT_ID(N'dbo.health_sources', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[health_sources] (
    [id] INT IDENTITY(1,1) PRIMARY KEY,
    [userId] INT NOT NULL,
    [provider] NVARCHAR(64) NOT NULL,
    [category] NVARCHAR(32) NOT NULL,
    [status] NVARCHAR(32) NOT NULL,
    [implementationStage] NVARCHAR(64) NOT NULL,
    [authType] NVARCHAR(32) NOT NULL,
    [displayName] NVARCHAR(120) NOT NULL,
    [description] NVARCHAR(MAX) NOT NULL,
    [lastSyncStatus] NVARCHAR(32) NOT NULL DEFAULT N'idle',
    [createdAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    [updatedAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX [idx_health_sources_userId_displayName] ON [dbo].[health_sources] ([userId], [displayName]);
END

IF OBJECT_ID(N'dbo.glucose_readings', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[glucose_readings] (
    [id] INT IDENTITY(1,1) PRIMARY KEY,
    [userId] INT NOT NULL,
    [sourceId] INT NOT NULL,
    [readingAt] BIGINT NOT NULL,
    [mgdl] FLOAT NOT NULL,
    [trend] NVARCHAR(64) NULL,
    [notes] NVARCHAR(MAX) NULL,
    [createdAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX [idx_glucose_readings_userId_readingAt] ON [dbo].[glucose_readings] ([userId], [readingAt] DESC);
  CREATE INDEX [idx_glucose_readings_sourceId] ON [dbo].[glucose_readings] ([sourceId]);
END
  `);
  return pool;
}

export async function getOrCreateGlucoseSource(userId: number, displayName: string = "Dexcom Clarity"): Promise<number> {
  const db = await getDb();
  if (db) {
    const existing = await db
      .select({ id: healthSources.id })
      .from(healthSources)
      .where(and(eq(healthSources.userId, userId), eq(healthSources.displayName, displayName)))
      .limit(1);

    if (existing.length > 0) return existing[0].id;

    const inserted = await db.insert(healthSources).values({
      userId,
      provider: "custom_app",
      category: "glucose",
      status: "connected",
      implementationStage: "custom",
      authType: "custom",
      displayName,
      description: `Glucose readings imported from ${displayName}`,
      lastSyncStatus: "idle",
    });

    return (inserted as any).insertId as number;
  }

  if (!ENV.azureSqlConnectionString) {
    throw new Error("Database is not available");
  }

  try {
    const pool = await ensureGlucoseInfrastructureAzureSql();
    const existing = await pool
      .request()
      .input("userId", userId)
      .input("displayName", displayName)
      .query<any>(`
SELECT TOP 1 [id]
FROM [dbo].[health_sources]
WHERE [userId] = @userId AND [displayName] = @displayName
ORDER BY [id] DESC
      `);

    if (existing.recordset?.length) {
      return Number(existing.recordset[0].id);
    }

    await pool
      .request()
      .input("userId", userId)
      .input("displayName", displayName)
      .query(`
INSERT INTO [dbo].[health_sources]
  ([userId], [provider], [category], [status], [implementationStage], [authType], [displayName], [description], [lastSyncStatus])
VALUES
  (@userId, N'custom_app', N'glucose', N'connected', N'custom', N'custom', @displayName, N'Imported glucose source', N'idle')
      `);

    const created = await pool
      .request()
      .input("userId", userId)
      .input("displayName", displayName)
      .query<any>(`
SELECT TOP 1 [id]
FROM [dbo].[health_sources]
WHERE [userId] = @userId AND [displayName] = @displayName
ORDER BY [id] DESC
      `);

    const id = created.recordset?.[0]?.id;
    if (!id) throw new Error("Failed to create glucose source");
    return Number(id);
  } catch (error) {
    console.error("[Database] Error ensuring glucose source (Azure SQL):", error);
    throw new Error("Failed to ensure glucose source");
  }
}

export async function addGlucoseReadings(userId: number, sourceId: number, readings: Array<{ readingAt: number; mgdl: number; trend?: string }>) {
  const db = await getDb();
  if (!db) {
    if (!ENV.azureSqlConnectionString) {
      throw new Error("Database is not available");
    }

    try {
      const pool = await ensureGlucoseInfrastructureAzureSql();
      for (const r of readings) {
        await pool
          .request()
          .input("userId", userId)
          .input("sourceId", sourceId)
          .input("readingAt", r.readingAt)
          .input("mgdl", r.mgdl)
          .input("trend", r.trend ?? null)
          .query(`
INSERT INTO [dbo].[glucose_readings] ([userId], [sourceId], [readingAt], [mgdl], [trend])
VALUES (@userId, @sourceId, @readingAt, @mgdl, @trend)
          `);
      }
      return;
    } catch (error) {
      console.error("[Database] Error adding glucose readings (Azure SQL):", error);
      throw new Error("Failed to save glucose readings");
    }
  }

  const values = readings.map(r => ({
    userId,
    sourceId,
    readingAt: r.readingAt,
    mgdl: r.mgdl,
    trend: r.trend || null,
  }));

  await db.insert(glucoseReadings).values(values);
}

export async function getGlucoseReadingsForDateRange(userId: number, startTime: number, endTime: number): Promise<GlucoseReading[]> {
  const db = await getDb();
  if (!db) {
    if (!ENV.azureSqlConnectionString) {
      console.warn("[Database] Cannot get glucose readings: database not available");
      return [];
    }

    try {
      const pool = await ensureGlucoseInfrastructureAzureSql();
      const result = await pool
        .request()
        .input("userId", userId)
        .input("startTime", startTime)
        .input("endTime", endTime)
        .query<any>(`
SELECT [id], [userId], [sourceId], [readingAt], [mgdl], [trend], [notes], [createdAt]
FROM [dbo].[glucose_readings]
WHERE [userId] = @userId AND [readingAt] >= @startTime AND [readingAt] <= @endTime
ORDER BY [readingAt] DESC, [id] DESC
        `);

      return (result.recordset || []).map((row: any) => ({
        id: row.id,
        userId: row.userId,
        sourceId: row.sourceId,
        readingAt: Number(row.readingAt),
        mgdl: row.mgdl,
        trend: row.trend,
        mealContext: null,
        notes: row.notes,
        createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
      })) as GlucoseReading[];
    } catch (error) {
      console.error("[Database] Error fetching glucose readings (Azure SQL):", error);
      return [];
    }
  }

  return db
    .select()
    .from(glucoseReadings)
    .where(
      and(
        eq(glucoseReadings.userId, userId),
        gte(glucoseReadings.readingAt, startTime),
        lte(glucoseReadings.readingAt, endTime)
      )
    )
    .orderBy((t) => desc(t.readingAt));
}

export async function calculateGlucoseStatistics(readings: GlucoseReading[]) {
  if (readings.length === 0) {
    return {
      count: 0,
      average: 0,
      min: 0,
      max: 0,
      stdDev: 0,
      timeInRange: 0,
      timeAboveRange: 0,
      timeBelowRange: 0,
      a1cEstimate: 0,
      timeRange: { start: null, end: null },
    };
  }

  const values = readings.map(r => r.mgdl);
  const average = values.reduce((a, b) => a + b, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);

  // Calculate standard deviation
  const variance = values.reduce((sum, val) => sum + Math.pow(val - average, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  // Calculate time in range (80-160 mg/dL)
  const inRange = values.filter(v => v >= 80 && v <= 160).length;
  const aboveRange = values.filter(v => v > 160).length;
  const belowRange = values.filter(v => v < 80).length;

  const timeInRange = (inRange / values.length) * 100;
  const timeAboveRange = (aboveRange / values.length) * 100;
  const timeBelowRange = (belowRange / values.length) * 100;

  // Calculate A1C estimate using the formula: A1C = (average glucose + 46.7) / 28.7
  const a1cEstimate = (average + 46.7) / 28.7;

  return {
    count: readings.length,
    average: Math.round(average * 10) / 10,
    min,
    max,
    stdDev: Math.round(stdDev * 10) / 10,
    timeInRange: Math.round(timeInRange * 10) / 10,
    timeAboveRange: Math.round(timeAboveRange * 10) / 10,
    timeBelowRange: Math.round(timeBelowRange * 10) / 10,
    a1cEstimate: Math.round(a1cEstimate * 100) / 100,
    timeRange: {
      start: new Date(readings[readings.length - 1].readingAt).toISOString(),
      end: new Date(readings[0].readingAt).toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------
// Step counter — saves to activitySamples (built-in pedometer source)
// ---------------------------------------------------------------------------

const PEDOMETER_SOURCE_NAME = "Built-in Pedometer";

async function ensurePedometerSource(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db
    .select({ id: healthSources.id })
    .from(healthSources)
    .where(
      and(
        eq(healthSources.userId, userId),
        eq(healthSources.displayName, PEDOMETER_SOURCE_NAME)
      )
    )
    .limit(1);

  if (existing.length > 0) return existing[0].id;

  const result = await db.insert(healthSources).values({
    userId,
    provider: "custom_app",
    category: "activity",
    status: "connected",
    implementationStage: "custom",
    authType: "custom",
    displayName: PEDOMETER_SOURCE_NAME,
    description: "Steps counted directly by the HumanAIze app accelerometer",
    lastSyncStatus: "idle",
  });
  return (result as any).insertId as number;
}

export async function logStepsForDay(
  userId: number,
  steps: number,
  dayStart: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const sourceId = await ensurePedometerSource(userId);

  const existing = await db
    .select({ id: activitySamples.id })
    .from(activitySamples)
    .where(
      and(
        eq(activitySamples.userId, userId),
        eq(activitySamples.sourceId, sourceId),
        eq(activitySamples.sampleDate, dayStart)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(activitySamples)
      .set({ steps })
      .where(eq(activitySamples.id, existing[0].id));
  } else {
    await db.insert(activitySamples).values({
      userId,
      sourceId,
      sampleDate: dayStart,
      steps,
      activeMinutes: 0,
      caloriesBurned: 0,
      workoutMinutes: 0,
      distanceKm: 0,
      sourceLabel: PEDOMETER_SOURCE_NAME,
    });
  }
}

export async function getTodaySteps(userId: number, dayStart: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const sourceId = await ensurePedometerSource(userId);

  const result = await db
    .select({ steps: activitySamples.steps })
    .from(activitySamples)
    .where(
      and(
        eq(activitySamples.userId, userId),
        eq(activitySamples.sourceId, sourceId),
        eq(activitySamples.sampleDate, dayStart)
      )
    )
    .limit(1);

  return result.length > 0 ? result[0].steps : 0;
}

export async function getStepHistory(
  userId: number,
  startDate: number,
  endDate: number
): Promise<{ date: number; steps: number }[]> {
  const db = await getDb();
  if (!db) return [];

  const sourceId = await ensurePedometerSource(userId);

  const rows = await db
    .select({ sampleDate: activitySamples.sampleDate, steps: activitySamples.steps })
    .from(activitySamples)
    .where(
      and(
        eq(activitySamples.userId, userId),
        eq(activitySamples.sourceId, sourceId),
        gte(activitySamples.sampleDate, startDate),
        lte(activitySamples.sampleDate, endDate)
      )
    )
    .orderBy(desc(activitySamples.sampleDate));

  return rows.map((r) => ({ date: r.sampleDate, steps: r.steps }));
}

let _didEnsureWorkoutTableMySql = false;

async function ensureWorkoutTableMySql(db: any) {
  if (_didEnsureWorkoutTableMySql) return;

  await db.execute(sql`
CREATE TABLE IF NOT EXISTS workout_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  exerciseName VARCHAR(191) NOT NULL,
  exerciseType VARCHAR(64) NOT NULL,
  durationMinutes INT NOT NULL,
  caloriesBurned INT NOT NULL DEFAULT 0,
  intensity VARCHAR(32) NOT NULL DEFAULT 'moderate',
  notes TEXT NULL,
  recordedAt BIGINT NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_workout_entries_userId_recordedAt (userId, recordedAt DESC)
)
  `);

  _didEnsureWorkoutTableMySql = true;
}

async function ensureWorkoutTableAzureSql() {
  const pool = await getAzureSqlPool();
  await pool.request().query(`
IF OBJECT_ID(N'dbo.workout_entries', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[workout_entries] (
    [id] INT IDENTITY(1,1) PRIMARY KEY,
    [userId] INT NOT NULL,
    [exerciseName] NVARCHAR(191) NOT NULL,
    [exerciseType] NVARCHAR(64) NOT NULL,
    [durationMinutes] INT NOT NULL,
    [caloriesBurned] INT NOT NULL DEFAULT 0,
    [intensity] NVARCHAR(32) NOT NULL DEFAULT 'moderate',
    [notes] NVARCHAR(MAX) NULL,
    [recordedAt] BIGINT NOT NULL,
    [createdAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX [idx_workout_entries_userId_recordedAt] ON [dbo].[workout_entries] ([userId], [recordedAt] DESC);
END
  `);

  return pool;
}

// Workout Tracking Functions
export async function addWorkoutEntry(
  userId: number,
  entry: {
    exerciseName: string;
    exerciseType: string;
    durationMinutes: number;
    caloriesBurned?: number;
    intensity?: string;
    notes?: string;
    recordedAt?: number;
  }
): Promise<WorkoutEntry> {
  const db = await getDb();
  const recordedAt = entry.recordedAt ?? Date.now();

  if (!db) {
    if (!ENV.azureSqlConnectionString) {
      throw new Error("Database is not available");
    }

    try {
      const pool = await ensureWorkoutTableAzureSql();
      await pool
        .request()
        .input("userId", userId)
        .input("exerciseName", entry.exerciseName)
        .input("exerciseType", entry.exerciseType)
        .input("durationMinutes", entry.durationMinutes)
        .input("caloriesBurned", entry.caloriesBurned ?? 0)
        .input("intensity", entry.intensity ?? "moderate")
        .input("notes", entry.notes ?? null)
        .input("recordedAt", recordedAt)
        .query(`
INSERT INTO [dbo].[workout_entries]
  ([userId], [exerciseName], [exerciseType], [durationMinutes], [caloriesBurned], [intensity], [notes], [recordedAt])
VALUES
  (@userId, @exerciseName, @exerciseType, @durationMinutes, @caloriesBurned, @intensity, @notes, @recordedAt)
        `);

      const created = await pool
        .request()
        .input("userId", userId)
        .query<any>(`
SELECT TOP 1 [id], [userId], [exerciseName], [exerciseType], [durationMinutes], [caloriesBurned], [intensity], [notes], [recordedAt], [createdAt]
FROM [dbo].[workout_entries]
WHERE [userId] = @userId
ORDER BY [recordedAt] DESC, [id] DESC
        `);

      const row = created.recordset?.[0];
      if (!row) throw new Error("Failed to create workout entry");

      return {
        id: row.id,
        userId: row.userId,
        exerciseName: row.exerciseName,
        exerciseType: row.exerciseType,
        durationMinutes: row.durationMinutes,
        caloriesBurned: row.caloriesBurned,
        intensity: row.intensity,
        notes: row.notes,
        recordedAt: Number(row.recordedAt),
        createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
      } as WorkoutEntry;
    } catch (error) {
      console.error("[Database] Error creating workout entry (Azure SQL):", error);
      throw new Error("Failed to create workout entry");
    }
  }

  await ensureWorkoutTableMySql(db);

  const newEntry: InsertWorkoutEntry = {
    userId,
    exerciseName: entry.exerciseName,
    exerciseType: entry.exerciseType,
    durationMinutes: entry.durationMinutes,
    caloriesBurned: entry.caloriesBurned ?? 0,
    intensity: entry.intensity ?? "moderate",
    notes: entry.notes ?? null,
    recordedAt,
  };

  await db.insert(workoutEntries).values(newEntry);

  const created = await db
    .select()
    .from(workoutEntries)
    .where(eq(workoutEntries.userId, userId))
    .orderBy((t) => desc(t.recordedAt))
    .limit(1);

  if (!created || created.length === 0) throw new Error("Failed to create workout entry");
  return created[0];
}

export async function getWorkoutEntries(userId: number, days: number = 30): Promise<WorkoutEntry[]> {
  const db = await getDb();
  const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;

  if (!db) {
    if (!ENV.azureSqlConnectionString) {
      console.warn("[Database] Cannot get workout entries: database not available");
      return [];
    }

    try {
      const pool = await ensureWorkoutTableAzureSql();
      const result = await pool
        .request()
        .input("userId", userId)
        .input("cutoffTime", cutoffTime)
        .query<any>(`
SELECT [id], [userId], [exerciseName], [exerciseType], [durationMinutes], [caloriesBurned], [intensity], [notes], [recordedAt], [createdAt]
FROM [dbo].[workout_entries]
WHERE [userId] = @userId AND [recordedAt] >= @cutoffTime
ORDER BY [recordedAt] DESC, [id] DESC
        `);

      return (result.recordset || []).map((row: any) => ({
        id: row.id,
        userId: row.userId,
        exerciseName: row.exerciseName,
        exerciseType: row.exerciseType,
        durationMinutes: row.durationMinutes,
        caloriesBurned: row.caloriesBurned,
        intensity: row.intensity,
        notes: row.notes,
        recordedAt: Number(row.recordedAt),
        createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
      })) as WorkoutEntry[];
    } catch (error) {
      console.error("[Database] Error fetching workout entries (Azure SQL):", error);
      return [];
    }
  }

  await ensureWorkoutTableMySql(db);

  try {
    return await db
      .select()
      .from(workoutEntries)
      .where(and(eq(workoutEntries.userId, userId), gte(workoutEntries.recordedAt, cutoffTime)))
      .orderBy((t) => desc(t.recordedAt));
  } catch (error) {
    console.error("[Database] Error fetching workout entries:", error);
    return [];
  }
}

export async function deleteWorkoutEntry(entryId: number, userId: number): Promise<boolean> {
  const db = await getDb();

  if (!db) {
    if (!ENV.azureSqlConnectionString) {
      throw new Error("Database is not available");
    }

    try {
      const pool = await ensureWorkoutTableAzureSql();
      const result = await pool
        .request()
        .input("entryId", entryId)
        .input("userId", userId)
        .query(`DELETE FROM [dbo].[workout_entries] WHERE [id] = @entryId AND [userId] = @userId`);
      return (result.rowsAffected?.[0] || 0) > 0;
    } catch (error) {
      console.error("[Database] Error deleting workout entry (Azure SQL):", error);
      throw new Error("Failed to delete workout entry");
    }
  }

  await ensureWorkoutTableMySql(db);
  await db.delete(workoutEntries).where(and(eq(workoutEntries.id, entryId), eq(workoutEntries.userId, userId)));
  return true;
}


// Weight Tracking Functions
export async function addWeightEntry(userId: number, weightLbs: number, recordedAt: number, notes?: string): Promise<WeightEntry> {
  const db = await getDb();
  if (!db) {
    if (!ENV.azureSqlConnectionString) {
      throw new Error("Database is not available");
    }

    try {
      const pool = await getAzureSqlPool();
      await pool.request().query(`
IF OBJECT_ID(N'dbo.weight_entries', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[weight_entries] (
    [id] INT IDENTITY(1,1) PRIMARY KEY,
    [userId] INT NOT NULL,
    [weightLbs] INT NOT NULL,
    [recordedAt] BIGINT NOT NULL,
    [notes] NVARCHAR(MAX) NULL,
    [createdAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX [idx_weight_entries_userId_recordedAt] ON [dbo].[weight_entries] ([userId], [recordedAt] DESC);
END
      `);

      await pool
        .request()
        .input("userId", userId)
        .input("weightLbs", weightLbs)
        .input("recordedAt", recordedAt)
        .input("notes", notes ?? null)
        .query(`
INSERT INTO [dbo].[weight_entries] ([userId], [weightLbs], [recordedAt], [notes])
VALUES (@userId, @weightLbs, @recordedAt, @notes)
        `);

      const created = await pool
        .request()
        .input("userId", userId)
        .query<any>(`
SELECT TOP 1 [id], [userId], [weightLbs], [recordedAt], [notes], [createdAt]
FROM [dbo].[weight_entries]
WHERE [userId] = @userId
ORDER BY [recordedAt] DESC, [id] DESC
        `);

      const row = created.recordset?.[0];
      if (!row) throw new Error("Failed to create weight entry");

      return {
        id: row.id,
        userId: row.userId,
        weightLbs: row.weightLbs,
        recordedAt: Number(row.recordedAt),
        notes: row.notes,
        createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
      } as WeightEntry;
    } catch (error) {
      console.error("[Database] Error creating weight entry (Azure SQL):", error);
      throw new Error("Failed to create weight entry");
    }
  }

  const newEntry: InsertWeightEntry = {
    userId,
    weightLbs,
    recordedAt,
    notes: notes || null,
  };

  await db.insert(weightEntries).values(newEntry);

  const created = await db
    .select()
    .from(weightEntries)
    .where(eq(weightEntries.userId, userId))
    .orderBy((t) => desc(t.recordedAt))
    .limit(1);

  if (!created || created.length === 0) throw new Error("Failed to create weight entry");
  return created[0];
}

export async function getWeightEntries(userId: number, days: number = 90): Promise<WeightEntry[]> {
  const db = await getDb();
  if (!db) {
    if (!ENV.azureSqlConnectionString) {
      console.warn("[Database] Cannot get weight entries: database not available");
      return [];
    }

    const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;

    try {
      const pool = await getAzureSqlPool();
      const result = await pool
        .request()
        .input("userId", userId)
        .input("cutoffTime", cutoffTime)
        .query<any>(`
SELECT [id], [userId], [weightLbs], [recordedAt], [notes], [createdAt]
FROM [dbo].[weight_entries]
WHERE [userId] = @userId AND [recordedAt] >= @cutoffTime
ORDER BY [recordedAt] DESC, [id] DESC
        `);

      return (result.recordset || []).map((row: any) => ({
        id: row.id,
        userId: row.userId,
        weightLbs: row.weightLbs,
        recordedAt: Number(row.recordedAt),
        notes: row.notes,
        createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
      })) as WeightEntry[];
    } catch (error) {
      console.error("[Database] Error fetching weight entries (Azure SQL):", error);
      return [];
    }
  }

  const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;

  try {
    const entries = await db
      .select()
      .from(weightEntries)
      .where(and(eq(weightEntries.userId, userId), gte(weightEntries.recordedAt, cutoffTime)))
      .orderBy((t) => desc(t.recordedAt));

    return entries;
  } catch (error) {
    console.error("[Database] Error fetching weight entries:", error);
    return [];
  }
}

export async function deleteWeightEntry(entryId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    if (!ENV.azureSqlConnectionString) {
      throw new Error("Database is not available");
    }

    try {
      const pool = await getAzureSqlPool();
      const result = await pool
        .request()
        .input("entryId", entryId)
        .input("userId", userId)
        .query(`DELETE FROM [dbo].[weight_entries] WHERE [id] = @entryId AND [userId] = @userId`);
      return (result.rowsAffected?.[0] || 0) > 0;
    } catch (error) {
      console.error("[Database] Error deleting weight entry (Azure SQL):", error);
      throw new Error("Failed to delete weight entry");
    }
  }

  await db.delete(weightEntries).where(and(eq(weightEntries.id, entryId), eq(weightEntries.userId, userId)));
  return true;
}

export async function getWeightProgressData(userId: number, days: number = 90): Promise<Array<{ date: string; weight: number }>> {
  const entries = await getWeightEntries(userId, days);
  
  if (entries.length === 0) {
    return [];
  }

  // Sort by date ascending for chart display
  const sorted = [...entries].sort((a, b) => a.recordedAt - b.recordedAt);

  return sorted.map(entry => ({
    date: new Date(entry.recordedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    weight: entry.weightLbs,
  }));
}

// ---------------------------------------------------------------------------
// CGM – glucose stats and daily averages
// ---------------------------------------------------------------------------

export async function getCGMStats(userId: number, days: number = 30) {
  const db = await getDb();
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  let readings: GlucoseReading[] = [];

  if (!db) {
    if (!ENV.azureSqlConnectionString) return null;
    try {
      const pool = await ensureGlucoseInfrastructureAzureSql();
      const result = await pool
        .request()
        .input("userId", userId)
        .input("since", since)
        .query<any>(`
SELECT [id], [userId], [sourceId], [readingAt], [mgdl], [trend], [notes], [createdAt]
FROM [dbo].[glucose_readings]
WHERE [userId] = @userId AND [readingAt] >= @since
ORDER BY [readingAt] DESC, [id] DESC
        `);

      readings = (result.recordset || []).map((row: any) => ({
        id: row.id,
        userId: row.userId,
        sourceId: row.sourceId,
        readingAt: Number(row.readingAt),
        mgdl: row.mgdl,
        trend: row.trend,
        mealContext: null,
        notes: row.notes,
        createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
      })) as GlucoseReading[];
    } catch (error) {
      console.error("[Database] Error getting CGM stats (Azure SQL):", error);
      return null;
    }
  } else {
    readings = await db
      .select()
      .from(glucoseReadings)
      .where(and(eq(glucoseReadings.userId, userId), gte(glucoseReadings.readingAt, since)))
      .orderBy(desc(glucoseReadings.readingAt));
  }

  if (readings.length === 0) return null;

  const values = readings.map(r => r.mgdl);
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  const inRange = values.filter(v => v >= 70 && v <= 180).length;
  const above = values.filter(v => v > 180).length;
  const below = values.filter(v => v < 70).length;
  // Correct A1C formula: (average_glucose / 28.7) + 2.15
  const a1c = Math.round(((avg / 28.7) + 2.15) * 100) / 100;
  // Ensure A1C is within valid range (4-12%)
  const a1cClamped = Math.max(4, Math.min(12, a1c));

  return {
    count: readings.length,
    average: Math.round(avg),
    min: Math.round(Math.min(...values)),
    max: Math.round(Math.max(...values)),
    timeInRange: Math.round((inRange / values.length) * 100),
    timeAboveRange: Math.round((above / values.length) * 100),
    timeBelowRange: Math.round((below / values.length) * 100),
    a1cEstimate: a1cClamped,
    latestReading: readings[0]?.mgdl ?? null,
    latestAt: readings[0]?.readingAt ?? null,
  };
}

export async function getCGMDailyAverages(userId: number, days: number = 7): Promise<{ date: string; avg: number; min: number; max: number }[]> {
  const db = await getDb();
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  let readings: GlucoseReading[] = [];

  if (!db) {
    if (!ENV.azureSqlConnectionString) return [];
    try {
      const pool = await ensureGlucoseInfrastructureAzureSql();
      const result = await pool
        .request()
        .input("userId", userId)
        .input("since", since)
        .query<any>(`
SELECT [id], [userId], [sourceId], [readingAt], [mgdl], [trend], [notes], [createdAt]
FROM [dbo].[glucose_readings]
WHERE [userId] = @userId AND [readingAt] >= @since
ORDER BY [readingAt] ASC, [id] ASC
        `);

      readings = (result.recordset || []).map((row: any) => ({
        id: row.id,
        userId: row.userId,
        sourceId: row.sourceId,
        readingAt: Number(row.readingAt),
        mgdl: row.mgdl,
        trend: row.trend,
        mealContext: null,
        notes: row.notes,
        createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
      })) as GlucoseReading[];
    } catch (error) {
      console.error("[Database] Error getting CGM daily averages (Azure SQL):", error);
      return [];
    }
  } else {
    readings = await db
      .select()
      .from(glucoseReadings)
      .where(and(eq(glucoseReadings.userId, userId), gte(glucoseReadings.readingAt, since)))
      .orderBy(glucoseReadings.readingAt);
  }

  // Group by calendar day
  const byDay = new Map<string, number[]>();
  for (const r of readings) {
    const day = new Date(r.readingAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(r.mgdl);
  }

  return Array.from(byDay.entries()).map(([date, vals]) => ({
    date,
    avg: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length),
    min: Math.round(Math.min(...vals)),
    max: Math.round(Math.max(...vals)),
  }));
}

export async function getRecentFoodLogsForInsights(userId: number, days: number = 7) {
  const db = await getDb();
  if (!db) return [];
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  return db.select().from(foodLogs)
    .where(and(eq(foodLogs.userId, userId), gte(foodLogs.loggedAt, since)))
    .orderBy(desc(foodLogs.loggedAt))
    .limit(50);
}

// Body Measurements
export async function addBodyMeasurement(
  userId: number,
  chest?: number,
  waist?: number,
  hips?: number,
  notes?: string
): Promise<BodyMeasurement | null> {
  const db = await getDb();
  if (!db) {
    if (!ENV.azureSqlConnectionString) return null;

    try {
      const pool = await getAzureSqlPool();
      await pool.request().query(`
IF OBJECT_ID(N'dbo.body_measurements', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[body_measurements] (
    [id] INT IDENTITY(1,1) PRIMARY KEY,
    [userId] INT NOT NULL,
    [chestInches] FLOAT NULL,
    [waistInches] FLOAT NULL,
    [hipsInches] FLOAT NULL,
    [recordedAt] BIGINT NOT NULL,
    [notes] NVARCHAR(MAX) NULL,
    [createdAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX [idx_body_measurements_userId_recordedAt] ON [dbo].[body_measurements] ([userId], [recordedAt] DESC);
END
      `);

      const recordedAt = Date.now();
      await pool
        .request()
        .input("userId", userId)
        .input("chestInches", chest ?? null)
        .input("waistInches", waist ?? null)
        .input("hipsInches", hips ?? null)
        .input("recordedAt", recordedAt)
        .input("notes", notes ?? null)
        .query(`
INSERT INTO [dbo].[body_measurements]
  ([userId], [chestInches], [waistInches], [hipsInches], [recordedAt], [notes])
VALUES
  (@userId, @chestInches, @waistInches, @hipsInches, @recordedAt, @notes)
        `);

      const created = await pool
        .request()
        .input("userId", userId)
        .query<any>(`
SELECT TOP 1 [id], [userId], [chestInches], [waistInches], [hipsInches], [recordedAt], [notes], [createdAt]
FROM [dbo].[body_measurements]
WHERE [userId] = @userId
ORDER BY [recordedAt] DESC, [id] DESC
        `);

      const row = created.recordset?.[0];
      if (!row) return null;

      return {
        id: row.id,
        userId: row.userId,
        chestInches: row.chestInches,
        waistInches: row.waistInches,
        hipsInches: row.hipsInches,
        recordedAt: Number(row.recordedAt),
        notes: row.notes,
        createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
      } as BodyMeasurement;
    } catch (error) {
      console.error("[Database] Error adding body measurement (Azure SQL):", error);
      return null;
    }
  }

  const result = await db.insert(bodyMeasurements).values({
    userId,
    chestInches: chest,
    waistInches: waist,
    hipsInches: hips,
    recordedAt: Date.now(),
    notes,
  });

  return result as any;
}

export async function getBodyMeasurements(userId: number, limit: number = 100): Promise<BodyMeasurement[]> {
  const db = await getDb();
  if (!db) {
    if (!ENV.azureSqlConnectionString) return [];

    try {
      const pool = await getAzureSqlPool();
      const result = await pool
        .request()
        .input("userId", userId)
        .query<any>(`
SELECT TOP (${limit}) [id], [userId], [chestInches], [waistInches], [hipsInches], [recordedAt], [notes], [createdAt]
FROM [dbo].[body_measurements]
WHERE [userId] = @userId
ORDER BY [recordedAt] DESC, [id] DESC
        `);

      return (result.recordset || []).map((row: any) => ({
        id: row.id,
        userId: row.userId,
        chestInches: row.chestInches,
        waistInches: row.waistInches,
        hipsInches: row.hipsInches,
        recordedAt: Number(row.recordedAt),
        notes: row.notes,
        createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
      })) as BodyMeasurement[];
    } catch (error) {
      console.error("[Database] Error fetching body measurements (Azure SQL):", error);
      return [];
    }
  }

  return db.select()
    .from(bodyMeasurements)
    .where(eq(bodyMeasurements.userId, userId))
    .orderBy(desc(bodyMeasurements.recordedAt))
    .limit(limit);
}

export async function deleteBodyMeasurement(id: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    if (!ENV.azureSqlConnectionString) return false;
    try {
      const pool = await getAzureSqlPool();
      const result = await pool
        .request()
        .input("id", id)
        .input("userId", userId)
        .query(`DELETE FROM [dbo].[body_measurements] WHERE [id] = @id AND [userId] = @userId`);
      return (result.rowsAffected?.[0] || 0) > 0;
    } catch (error) {
      console.error("[Database] Error deleting body measurement (Azure SQL):", error);
      return false;
    }
  }

  const result = await db.delete(bodyMeasurements)
    .where(and(eq(bodyMeasurements.id, id), eq(bodyMeasurements.userId, userId)));

  return (result as any).affectedRows > 0;
}

// ---------------------------------------------------------------------------
// Manual Glucose Entry
// ---------------------------------------------------------------------------

const MANUAL_GLUCOSE_SOURCE_NAME = "Manual Entry";

async function ensureManualGlucoseSource(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) {
    return getOrCreateGlucoseSource(userId, MANUAL_GLUCOSE_SOURCE_NAME);
  }

  const existing = await db
    .select({ id: healthSources.id })
    .from(healthSources)
    .where(
      and(
        eq(healthSources.userId, userId),
        eq(healthSources.displayName, MANUAL_GLUCOSE_SOURCE_NAME)
      )
    )
    .limit(1);

  if (existing.length > 0) return existing[0].id;

  const result = await db.insert(healthSources).values({
    userId,
    provider: "custom_app",
    category: "glucose",
    status: "connected",
    implementationStage: "custom",
    authType: "custom",
    displayName: MANUAL_GLUCOSE_SOURCE_NAME,
    description: "Glucose readings entered manually by the user",
    lastSyncStatus: "idle",
  });
  return (result as any).insertId as number;
}

export async function addManualGlucoseEntry(
  userId: number,
  mgdl: number,
  readingAt: number,
  notes?: string
) {
  const db = await getDb();
  if (!db) {
    if (!ENV.azureSqlConnectionString) throw new Error("Database not available");
    try {
      const sourceId = await ensureManualGlucoseSource(userId);
      const pool = await ensureGlucoseInfrastructureAzureSql();
      await pool
        .request()
        .input("userId", userId)
        .input("sourceId", sourceId)
        .input("readingAt", readingAt)
        .input("mgdl", mgdl)
        .input("notes", notes ?? null)
        .query(`
INSERT INTO [dbo].[glucose_readings] ([userId], [sourceId], [readingAt], [mgdl], [notes])
VALUES (@userId, @sourceId, @readingAt, @mgdl, @notes)
        `);
      return;
    } catch (error) {
      console.error("[Database] Error adding manual glucose (Azure SQL):", error);
      throw new Error("Failed to save glucose reading");
    }
  }

  const sourceId = await ensureManualGlucoseSource(userId);
  await db.insert(glucoseReadings).values({
    userId,
    sourceId,
    readingAt,
    mgdl,
    notes: notes ?? null,
  });
}

export async function getTodayManualGlucoseEntries(
  userId: number,
  dayStart: number
): Promise<GlucoseReading[]> {
  const db = await getDb();
  if (!db) {
    if (!ENV.azureSqlConnectionString) return [];
    try {
      const sourceId = await ensureManualGlucoseSource(userId);
      const pool = await ensureGlucoseInfrastructureAzureSql();
      const result = await pool
        .request()
        .input("userId", userId)
        .input("sourceId", sourceId)
        .input("dayStart", dayStart)
        .query<any>(`
SELECT [id], [userId], [sourceId], [readingAt], [mgdl], [trend], [notes], [createdAt]
FROM [dbo].[glucose_readings]
WHERE [userId] = @userId AND [sourceId] = @sourceId AND [readingAt] >= @dayStart
ORDER BY [readingAt] DESC, [id] DESC
        `);

      return (result.recordset || []).map((row: any) => ({
        id: row.id,
        userId: row.userId,
        sourceId: row.sourceId,
        readingAt: Number(row.readingAt),
        mgdl: row.mgdl,
        trend: row.trend,
        mealContext: null,
        notes: row.notes,
        createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
      })) as GlucoseReading[];
    } catch (error) {
      console.error("[Database] Error fetching manual glucose (Azure SQL):", error);
      return [];
    }
  }

  const sourceId = await db
    .select({ id: healthSources.id })
    .from(healthSources)
    .where(
      and(
        eq(healthSources.userId, userId),
        eq(healthSources.displayName, MANUAL_GLUCOSE_SOURCE_NAME)
      )
    )
    .limit(1);

  if (sourceId.length === 0) return [];

  return db
    .select()
    .from(glucoseReadings)
    .where(
      and(
        eq(glucoseReadings.userId, userId),
        eq(glucoseReadings.sourceId, sourceId[0].id),
        gte(glucoseReadings.readingAt, dayStart)
      )
    )
    .orderBy(desc(glucoseReadings.readingAt));
}

export async function deleteManualGlucoseEntry(id: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    if (!ENV.azureSqlConnectionString) return false;
    try {
      const sourceId = await ensureManualGlucoseSource(userId);
      const pool = await ensureGlucoseInfrastructureAzureSql();
      const result = await pool
        .request()
        .input("id", id)
        .input("userId", userId)
        .input("sourceId", sourceId)
        .query(`
DELETE FROM [dbo].[glucose_readings]
WHERE [id] = @id AND [userId] = @userId AND [sourceId] = @sourceId
        `);
      return (result.rowsAffected?.[0] || 0) > 0;
    } catch (error) {
      console.error("[Database] Error deleting manual glucose (Azure SQL):", error);
      return false;
    }
  }

  const result = await db.delete(glucoseReadings)
    .where(and(eq(glucoseReadings.id, id), eq(glucoseReadings.userId, userId)));

  return (result as any).affectedRows > 0;
}

export async function getBodyMeasurementTrends(userId: number, days: number = 30): Promise<{
  chest: { current?: number; previous?: number; change?: number };
  waist: { current?: number; previous?: number; change?: number };
  hips: { current?: number; previous?: number; change?: number };
}> {
  const db = await getDb();
  if (!db) {
    if (!ENV.azureSqlConnectionString) return { chest: {}, waist: {}, hips: {} };

    try {
      const since = Date.now() - days * 24 * 60 * 60 * 1000;
      const pool = await getAzureSqlPool();
      const result = await pool
        .request()
        .input("userId", userId)
        .input("since", since)
        .query<any>(`
SELECT [id], [userId], [chestInches], [waistInches], [hipsInches], [recordedAt], [notes], [createdAt]
FROM [dbo].[body_measurements]
WHERE [userId] = @userId AND [recordedAt] >= @since
ORDER BY [recordedAt] DESC, [id] DESC
        `);

      const measurements = (result.recordset || []).map((row: any) => ({
        id: row.id,
        userId: row.userId,
        chestInches: row.chestInches,
        waistInches: row.waistInches,
        hipsInches: row.hipsInches,
        recordedAt: Number(row.recordedAt),
        notes: row.notes,
        createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
      })) as BodyMeasurement[];

      if (measurements.length === 0) {
        return { chest: {}, waist: {}, hips: {} };
      }

      const latest = measurements[0];
      const oldest = measurements[measurements.length - 1];

      return {
        chest: {
          current: latest.chestInches ?? undefined,
          previous: oldest.chestInches ?? undefined,
          change: latest.chestInches && oldest.chestInches ? latest.chestInches - oldest.chestInches : undefined,
        },
        waist: {
          current: latest.waistInches ?? undefined,
          previous: oldest.waistInches ?? undefined,
          change: latest.waistInches && oldest.waistInches ? latest.waistInches - oldest.waistInches : undefined,
        },
        hips: {
          current: latest.hipsInches ?? undefined,
          previous: oldest.hipsInches ?? undefined,
          change: latest.hipsInches && oldest.hipsInches ? latest.hipsInches - oldest.hipsInches : undefined,
        },
      };
    } catch (error) {
      console.error("[Database] Error getting body measurement trends (Azure SQL):", error);
      return { chest: {}, waist: {}, hips: {} };
    }
  }

  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const measurements = await db.select()
    .from(bodyMeasurements)
    .where(and(eq(bodyMeasurements.userId, userId), gte(bodyMeasurements.recordedAt, since)))
    .orderBy(desc(bodyMeasurements.recordedAt));

  if (measurements.length === 0) {
    return { chest: {}, waist: {}, hips: {} };
  }

  const latest = measurements[0];
  const oldest = measurements[measurements.length - 1];

  return {
    chest: {
      current: latest.chestInches ?? undefined,
      previous: oldest.chestInches ?? undefined,
      change: latest.chestInches && oldest.chestInches ? latest.chestInches - oldest.chestInches : undefined,
    },
    waist: {
      current: latest.waistInches ?? undefined,
      previous: oldest.waistInches ?? undefined,
      change: latest.waistInches && oldest.waistInches ? latest.waistInches - oldest.waistInches : undefined,
    },
    hips: {
      current: latest.hipsInches ?? undefined,
      previous: oldest.hipsInches ?? undefined,
      change: latest.hipsInches && oldest.hipsInches ? latest.hipsInches - oldest.hipsInches : undefined,
    },
  };
}
