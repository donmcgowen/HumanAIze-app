/**
 * db.pg.ts — Neon PostgreSQL database layer for HumanAIze
 *
 * This file replaces db.ts for the Neon backend. It uses:
 *   - @neondatabase/serverless  (HTTP-based Neon driver)
 *   - drizzle-orm/neon-serverless
 *   - schema types from drizzle/schema.pg.ts (which mirrors the Neon DDL)
 *
 * All exported functions have the same signatures as db.ts so that
 * routers.ts and auth.ts can import from this file without changes.
 */

import { and, eq, gte, lte, lt, desc, sql, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { ENV } from "./_core/env";
import { calculateMacroTargets, calculateTDEE, type FitnessGoal } from "./fitnessGoal";

// ── Schema imports ────────────────────────────────────────────────────────────
// We import types and table objects from the PG schema.
// The PG schema uses different column names in some places (heightInches vs heightIn,
// age vs ageYears) — we map them at the boundary.
import {
  users,
  userProfiles,
  foodLogs,
  favoriteFoods,
  mealTemplates,
  foodSearchCache,
  progressPhotos,
  healthSources,
  glucoseReadings,
  activitySamples,
  weightEntries,
  workoutEntries,
  bodyMeasurements,
  groceryItems,
} from "../drizzle/schema.pg";

// Re-export types so callers that do `import { FoodLog } from "./db.pg"` work.
export type {
  User,
  InsertUser,
  UserProfile,
  InsertUserProfile,
  FoodLog,
  InsertFoodLog,
  FavoriteFood,
  InsertFavoriteFood,
  MealTemplate,
  InsertMealTemplate,
  FoodSearchCache,
  InsertFoodSearchCache,
  ProgressPhoto,
  InsertProgressPhoto,
  WeightEntry,
  InsertWeightEntry,
  WorkoutEntry,
  InsertWorkoutEntry,
  BodyMeasurement,
  InsertBodyMeasurement,
  GroceryItem,
  InsertGroceryItem,
} from "../drizzle/schema.pg";

// GlucoseReading is not exported as a named type from schema.pg, define locally:
export type GlucoseReading = {
  id: number;
  userId: number;
  sourceId: number | null;
  readingAt: number;
  mgdl: number;
  trend: string | null;
  mealContext: string | null;
  notes: string | null;
  createdAt: Date;
  // legacy columns (may be null for new rows)
  glucoseMgDl?: number | null;
  readingType?: string | null;
  recordedAt?: number | null;
};

// ── DB singleton ──────────────────────────────────────────────────────────────
let _db: ReturnType<typeof drizzle> | null = null;

function getNeonUrl(): string {
  return (
    process.env.NEON_DATABASE_URL ??
    process.env.DATABASE_URL ??
    ""
  );
}

export function getDb() {
  const url = getNeonUrl();
  if (!url) {
    if (!_db) {
      console.warn("[db.pg] No NEON_DATABASE_URL configured.");
    }
    return null;
  }
  if (!_db) {
    try {
      const sqlClient = neon(url);
      _db = drizzle(sqlClient);
    } catch (err) {
      console.error("[db.pg] Failed to create Neon HTTP client:", err);
      return null;
    }
  }
  return _db;
}

// ── Diagnostics ───────────────────────────────────────────────────────────────
export function getDatabaseDiagnostics() {
  const url = getNeonUrl();
  return {
    configured: Boolean(url),
    source: url ? "NEON_DATABASE_URL" : "none",
    looksLikeSqlServer: false,
    looksLikeMysqlUrl: false,
  };
}

export async function getDatabaseHealth() {
  const db = getDb();
  if (!db) {
    return { ok: false, diagnostics: getDatabaseDiagnostics(), reason: "missing_connection_string" as const };
  }
  try {
    await db.execute(sql`SELECT 1`);
    return { ok: true, diagnostics: getDatabaseDiagnostics(), reason: "connected" as const };
  } catch {
    return { ok: false, diagnostics: getDatabaseDiagnostics(), reason: "connection_failed" as const };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
/**
 * Map Neon user_profiles row → the shape expected by the rest of the app.
 * The PG schema uses heightInches / age; the app uses heightIn / ageYears.
 */
function pgProfileToApp(row: any): any {
  if (!row) return null;
  return {
    ...row,
    // Prefer the explicit heightIn / ageYears columns (added via migration),
    // fall back to the original heightInches / age columns.
    heightIn: row.heightIn ?? row.heightInches ?? null,
    ageYears: row.ageYears ?? row.age ?? null,
    onboardingCompleted: row.onboardingCompleted === true || row.onboardingCompleted === 1,
  };
}

function resolveProfileTargets(profile: any): any {
  const pos = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
  const storedCalories = pos(profile.dailyCalorieTarget);
  const storedProtein  = pos(profile.dailyProteinTarget);
  const storedCarbs    = pos(profile.dailyCarbsTarget);
  const storedFat      = pos(profile.dailyFatTarget);
  if (storedCalories !== null && storedProtein !== null && storedCarbs !== null && storedFat !== null) {
    return profile;
  }
  const heightIn = profile.heightIn ?? profile.heightInches;
  const ageYears = profile.ageYears ?? profile.age;
  const hasBiometrics =
    typeof profile.weightLbs === "number" && profile.weightLbs > 0 &&
    typeof heightIn === "number" && heightIn > 0 &&
    typeof ageYears === "number" && ageYears > 0;
  if (!hasBiometrics) return profile;
  try {
    const weightKg = profile.weightLbs * 0.453592;
    const heightCm = heightIn * 2.54;
    const tdee = calculateTDEE(weightKg, heightCm, ageYears, true);
    const targets = calculateMacroTargets(
      tdee, weightKg,
      (profile.fitnessGoal || "maintain") as FitnessGoal,
      profile.weightLbs,
      profile.goalWeightLbs ?? undefined,
      profile.goalDate ?? undefined
    );
    return {
      ...profile,
      dailyCalorieTarget: storedCalories ?? targets.dailyCalories,
      dailyProteinTarget: storedProtein  ?? targets.dailyProtein,
      dailyCarbsTarget:   storedCarbs    ?? targets.dailyCarbs,
      dailyFatTarget:     storedFat      ?? targets.dailyFat,
    };
  } catch {
    return profile;
  }
}

// ── User functions (used by auth.ts and sdk.ts) ───────────────────────────────

export async function upsertUser(user: any): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = getDb();
  if (!db) { console.warn("[db.pg] upsertUser: no db"); return; }
  try {
    const values: any = { openId: user.openId };
    const updateSet: any = {};
    for (const field of ["name", "email", "loginMethod"] as const) {
      if (user[field] !== undefined) {
        values[field] = user[field] ?? null;
        updateSet[field] = user[field] ?? null;
      }
    }
    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (Object.keys(updateSet).length > 0) {
      await db.insert(users).values(values).onConflictDoUpdate({
        target: users.openId,
        set: updateSet,
      });
    } else {
      await db.insert(users).values(values).onConflictDoNothing();
    }
  } catch (err) {
    console.warn("[db.pg] upsertUser error:", err);
  }
}

export async function getUserByOpenId(openId: string) {
  const db = getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId as any, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ── User Profile ──────────────────────────────────────────────────────────────

export async function getUserProfile(userId: number): Promise<any | null> {
  const db = getDb();
  if (!db) return null;
  try {
    const result = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
    if (result.length === 0) return null;
    return resolveProfileTargets(pgProfileToApp(result[0]));
  } catch (err) {
    console.warn("[db.pg] getUserProfile error:", err);
    return null;
  }
}

export async function upsertUserProfile(userId: number, updates: any): Promise<any> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  // Map app field names → PG column names
  const pgUpdates: any = { ...updates };
  if (updates.heightIn !== undefined) {
    pgUpdates.heightIn = updates.heightIn;
    pgUpdates.heightInches = updates.heightIn; // keep both in sync
  }
  if (updates.ageYears !== undefined) {
    pgUpdates.ageYears = updates.ageYears;
    pgUpdates.age = updates.ageYears;
  }
  // Remove undefined values
  const filtered = Object.fromEntries(
    Object.entries(pgUpdates).filter(([, v]) => v !== undefined)
  );

  const existing = await getUserProfile(userId);
  if (existing) {
    if (Object.keys(filtered).length > 0) {
      await db.update(userProfiles).set(filtered).where(eq(userProfiles.userId, userId));
    }
  } else {
    await db.insert(userProfiles).values({ userId, ...filtered });
  }
  const result = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  if (!result || result.length === 0) throw new Error("Failed to upsert user profile");
  return resolveProfileTargets(pgProfileToApp(result[0]));
}

// ── Food Logging ──────────────────────────────────────────────────────────────

export async function addFoodLog(userId: number, log: any): Promise<any> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const newLog: any = {
    userId,
    foodName: log.foodName,
    servingSize: log.servingSize ?? "1 serving",
    calories: log.calories,
    proteinGrams: log.proteinGrams,
    carbsGrams: log.carbsGrams,
    fatGrams: log.fatGrams,
    sugarGrams: log.sugarGrams ?? null,
    loggedAt: log.loggedAt,
    mealType: log.mealType ?? "other",
    notes: log.notes ?? null,
    logDate: new Date(log.loggedAt).toISOString().split("T")[0],
  };
  await db.insert(foodLogs).values(newLog);
  const created = await db.select().from(foodLogs)
    .where(eq(foodLogs.userId, userId))
    .orderBy(desc(foodLogs.loggedAt))
    .limit(1);
  if (!created || created.length === 0) throw new Error("Failed to create food log");
  return created[0];
}

export async function getFoodLogsForDay(userId: number, startOfDay: number, endOfDay: number): Promise<any[]> {
  const db = getDb();
  if (!db) return [];
  return db.select().from(foodLogs)
    .where(and(eq(foodLogs.userId, userId), gte(foodLogs.loggedAt, startOfDay), lte(foodLogs.loggedAt, endOfDay)))
    .orderBy(desc(foodLogs.loggedAt));
}

export async function getRecentFoods(userId: number, limit: number = 5): Promise<any[]> {
  const db = getDb();
  if (!db) return [];
  return db.select().from(foodLogs).where(eq(foodLogs.userId, userId)).orderBy(desc(foodLogs.loggedAt)).limit(limit);
}

export async function getFrequentFoods(
  userId: number,
  query?: string,
  limit: number = 10
): Promise<Array<{
  foodName: string; servingSize: string; calories: number;
  proteinGrams: number; carbsGrams: number; fatGrams: number;
  logCount: number; lastLoggedAt: number;
}>> {
  const db = getDb();
  if (!db) return [];
  const conditions: any[] = [eq(foodLogs.userId, userId)];
  if (query && query.trim().length > 0) {
    conditions.push(sql`LOWER(${foodLogs.foodName}) LIKE LOWER(${`%${query.trim()}%`})`);
  }
  const results = await db.select({
    foodName: foodLogs.foodName,
    servingSize: foodLogs.servingSize,
    calories: foodLogs.calories,
    proteinGrams: foodLogs.proteinGrams,
    carbsGrams: foodLogs.carbsGrams,
    fatGrams: foodLogs.fatGrams,
    logCount: sql<number>`COUNT(*)`.as("logCount"),
    lastLoggedAt: sql<number>`MAX(${foodLogs.loggedAt})`.as("lastLoggedAt"),
  }).from(foodLogs)
    .where(and(...conditions))
    .groupBy(foodLogs.foodName, foodLogs.servingSize, foodLogs.calories, foodLogs.proteinGrams, foodLogs.carbsGrams, foodLogs.fatGrams)
    .orderBy(desc(sql`COUNT(*)`), desc(sql`MAX(${foodLogs.loggedAt})`))
    .limit(limit);
  return results.map(r => ({
    foodName: r.foodName,
    servingSize: r.servingSize || "1 serving",
    calories: r.calories,
    proteinGrams: r.proteinGrams,
    carbsGrams: r.carbsGrams,
    fatGrams: r.fatGrams,
    logCount: Number(r.logCount),
    lastLoggedAt: Number(r.lastLoggedAt),
  }));
}

export async function autoAddToFavorites(userId: number, foodName: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    const countResult = await db.select({ count: sql<number>`COUNT(*)` })
      .from(foodLogs)
      .where(and(eq(foodLogs.userId, userId), eq(foodLogs.foodName, foodName)));
    const logCount = Number(countResult[0]?.count ?? 0);
    if (logCount < 5) return;
    const existing = await db.select({ id: favoriteFoods.id })
      .from(favoriteFoods)
      .where(and(eq(favoriteFoods.userId, userId), eq(favoriteFoods.foodName, foodName)))
      .limit(1);
    if (existing.length > 0) return;
    const log = await db.select().from(foodLogs)
      .where(and(eq(foodLogs.userId, userId), eq(foodLogs.foodName, foodName)))
      .orderBy(desc(foodLogs.loggedAt)).limit(1);
    if (!log || log.length === 0) return;
    await db.insert(favoriteFoods).values({
      userId,
      foodName: log[0].foodName,
      servingSize: log[0].servingSize || "1 serving",
      calories: log[0].calories,
      proteinGrams: log[0].proteinGrams,
      carbsGrams: log[0].carbsGrams,
      fatGrams: log[0].fatGrams,
      source: "manual" as any,
    });
  } catch (err) {
    console.warn("[AutoFavorite] Error:", err);
  }
}

export async function deleteFoodLog(foodLogId: number, userId: number): Promise<boolean> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(foodLogs).where(and(eq(foodLogs.id, foodLogId), eq(foodLogs.userId, userId)));
  return true;
}

export async function updateFoodLog(foodLogId: number, userId: number, updates: any): Promise<any> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const filtered = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
  if (Object.keys(filtered).length > 0) {
    await db.update(foodLogs).set(filtered).where(and(eq(foodLogs.id, foodLogId), eq(foodLogs.userId, userId)));
  }
  const updated = await db.select().from(foodLogs).where(eq(foodLogs.id, foodLogId)).limit(1);
  if (!updated || updated.length === 0) throw new Error("Failed to update food log");
  return updated[0];
}

// ── Favorite Foods ────────────────────────────────────────────────────────────

export async function addFavoriteFood(userId: number, food: any): Promise<any> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(favoriteFoods).values({ userId, ...food });
  const created = await db.select().from(favoriteFoods)
    .where(eq(favoriteFoods.userId, userId))
    .orderBy(desc(favoriteFoods.createdAt)).limit(1);
  if (!created || created.length === 0) throw new Error("Failed to create favorite food");
  return created[0];
}

export async function getFavoriteFoods(userId: number): Promise<any[]> {
  const db = getDb();
  if (!db) return [];
  return db.select().from(favoriteFoods).where(eq(favoriteFoods.userId, userId)).orderBy(desc(favoriteFoods.createdAt));
}

export async function deleteFavoriteFood(favoriteFoodId: number, userId: number): Promise<boolean> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(favoriteFoods).where(and(eq(favoriteFoods.id, favoriteFoodId), eq(favoriteFoods.userId, userId)));
  return true;
}

// ── Meal Templates ────────────────────────────────────────────────────────────

function rowToMealTemplate(row: any): any {
  return {
    ...row,
    // Normalise field aliases
    mealName: row.mealName ?? row.name ?? null,
    name: row.name ?? row.mealName ?? null,
    totalProteinGrams: row.totalProteinGrams ?? row.totalProtein ?? 0,
    totalCarbsGrams: row.totalCarbsGrams ?? row.totalCarbs ?? 0,
    totalFatGrams: row.totalFatGrams ?? row.totalFat ?? 0,
    foods: typeof row.foods === "string" ? JSON.parse(row.foods) : (row.foods ?? []),
    createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt),
  };
}

export async function createMealTemplate(userId: number, meal: any): Promise<any> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const newMeal: any = {
    userId,
    name: meal.mealName ?? meal.name,
    mealName: meal.mealName ?? meal.name,
    mealType: meal.mealType ?? "other",
    foods: JSON.stringify(meal.foods ?? []),
    totalCalories: meal.totalCalories ?? 0,
    totalProtein: meal.totalProteinGrams ?? meal.totalProtein ?? 0,
    totalCarbs: meal.totalCarbsGrams ?? meal.totalCarbs ?? 0,
    totalFat: meal.totalFatGrams ?? meal.totalFat ?? 0,
    totalProteinGrams: meal.totalProteinGrams ?? meal.totalProtein ?? 0,
    totalCarbsGrams: meal.totalCarbsGrams ?? meal.totalCarbs ?? 0,
    totalFatGrams: meal.totalFatGrams ?? meal.totalFat ?? 0,
    notes: meal.notes ?? null,
  };
  await db.insert(mealTemplates).values(newMeal);
  const created = await db.select().from(mealTemplates)
    .where(eq(mealTemplates.userId, userId))
    .orderBy(desc(mealTemplates.createdAt)).limit(1);
  if (!created || created.length === 0) throw new Error("Failed to create meal template");
  return rowToMealTemplate(created[0]);
}

export async function getMealTemplates(userId: number): Promise<any[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.select().from(mealTemplates).where(eq(mealTemplates.userId, userId)).orderBy(desc(mealTemplates.createdAt));
  return rows.map(rowToMealTemplate);
}

export async function getMealTemplate(mealTemplateId: number, userId: number): Promise<any | null> {
  const db = getDb();
  if (!db) return null;
  const result = await db.select().from(mealTemplates)
    .where(and(eq(mealTemplates.id, mealTemplateId), eq(mealTemplates.userId, userId))).limit(1);
  return result.length > 0 ? rowToMealTemplate(result[0]) : null;
}

export async function updateMealTemplate(mealTemplateId: number, userId: number, updates: any): Promise<any> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const pgUpdates: any = { ...updates };
  if (updates.mealName !== undefined) pgUpdates.name = updates.mealName;
  if (updates.totalProteinGrams !== undefined) pgUpdates.totalProtein = updates.totalProteinGrams;
  if (updates.totalCarbsGrams !== undefined) pgUpdates.totalCarbs = updates.totalCarbsGrams;
  if (updates.totalFatGrams !== undefined) pgUpdates.totalFat = updates.totalFatGrams;
  if (updates.foods !== undefined) pgUpdates.foods = JSON.stringify(updates.foods);
  await db.update(mealTemplates).set(pgUpdates).where(and(eq(mealTemplates.id, mealTemplateId), eq(mealTemplates.userId, userId)));
  const updated = await db.select().from(mealTemplates).where(eq(mealTemplates.id, mealTemplateId)).limit(1);
  if (!updated || updated.length === 0) throw new Error("Failed to update meal template");
  return rowToMealTemplate(updated[0]);
}

export async function deleteMealTemplate(mealTemplateId: number, userId: number): Promise<boolean> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(mealTemplates).where(and(eq(mealTemplates.id, mealTemplateId), eq(mealTemplates.userId, userId)));
  return true;
}

// ── Macro Trends ──────────────────────────────────────────────────────────────

export interface DailyMacroStats {
  date: string; calories: number; protein: number; carbs: number; fat: number;
  calorieTarget?: number; proteinTarget?: number; carbsTarget?: number; fatTarget?: number;
}
export interface MacroTrend {
  dailyStats: DailyMacroStats[];
  weeklyAverages: { week: string; avgCalories: number; avgProtein: number; avgCarbs: number; avgFat: number }[];
  monthlyAverages: { month: string; avgCalories: number; avgProtein: number; avgCarbs: number; avgFat: number }[];
  consistencyMetrics: {
    daysTracked: number; daysHitCalorieTarget: number; daysHitProteinTarget: number;
    daysHitCarbsTarget: number; daysHitFatTarget: number; adherenceRate: number;
  };
}

export async function getMacroTrends(userId: number, startDate: number, endDate: number): Promise<MacroTrend> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const profile = await getUserProfile(userId);
  const calorieTarget = profile?.dailyCalorieTarget || 0;
  const proteinTarget = profile?.dailyProteinTarget || 0;
  const carbsTarget   = profile?.dailyCarbsTarget || 0;
  const fatTarget     = profile?.dailyFatTarget || 0;
  const logs = await db.select().from(foodLogs)
    .where(and(eq(foodLogs.userId, userId), gte(foodLogs.loggedAt, startDate), lte(foodLogs.loggedAt, endDate)))
    .orderBy(foodLogs.loggedAt);
  const dailyMap = new Map<string, DailyMacroStats>();
  logs.forEach(log => {
    const dateStr = new Date(log.loggedAt).toISOString().split("T")[0];
    if (!dailyMap.has(dateStr)) {
      dailyMap.set(dateStr, { date: dateStr, calories: 0, protein: 0, carbs: 0, fat: 0, calorieTarget, proteinTarget, carbsTarget, fatTarget });
    }
    const d = dailyMap.get(dateStr)!;
    d.calories += log.calories;
    d.protein  += log.proteinGrams;
    d.carbs    += log.carbsGrams;
    d.fat      += log.fatGrams;
  });
  const dailyStats = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  const weeklyMap = new Map<string, { stats: DailyMacroStats[]; week: string }>();
  dailyStats.forEach(stat => {
    const d = new Date(stat.date);
    const ws = new Date(d); ws.setDate(d.getDate() - d.getDay());
    const weekStr = ws.toISOString().split("T")[0];
    if (!weeklyMap.has(weekStr)) weeklyMap.set(weekStr, { stats: [], week: weekStr });
    weeklyMap.get(weekStr)!.stats.push(stat);
  });
  const weeklyAverages = Array.from(weeklyMap.values()).map(({ stats, week }) => ({
    week,
    avgCalories: Math.round(stats.reduce((s, x) => s + x.calories, 0) / stats.length),
    avgProtein:  Math.round(stats.reduce((s, x) => s + x.protein, 0)  / stats.length),
    avgCarbs:    Math.round(stats.reduce((s, x) => s + x.carbs, 0)    / stats.length),
    avgFat:      Math.round(stats.reduce((s, x) => s + x.fat, 0)      / stats.length),
  }));
  const monthlyMap = new Map<string, { stats: DailyMacroStats[]; month: string }>();
  dailyStats.forEach(stat => {
    const monthStr = stat.date.slice(0, 7);
    if (!monthlyMap.has(monthStr)) monthlyMap.set(monthStr, { stats: [], month: monthStr });
    monthlyMap.get(monthStr)!.stats.push(stat);
  });
  const monthlyAverages = Array.from(monthlyMap.values()).map(({ stats, month }) => ({
    month,
    avgCalories: Math.round(stats.reduce((s, x) => s + x.calories, 0) / stats.length),
    avgProtein:  Math.round(stats.reduce((s, x) => s + x.protein, 0)  / stats.length),
    avgCarbs:    Math.round(stats.reduce((s, x) => s + x.carbs, 0)    / stats.length),
    avgFat:      Math.round(stats.reduce((s, x) => s + x.fat, 0)      / stats.length),
  }));
  const daysTracked = dailyStats.length;
  let daysHitCalorieTarget = 0, daysHitProteinTarget = 0, daysHitCarbsTarget = 0, daysHitFatTarget = 0;
  dailyStats.forEach(s => {
    if (s.calories >= calorieTarget * 0.9 && s.calories <= calorieTarget * 1.1) daysHitCalorieTarget++;
    if (s.protein  >= proteinTarget * 0.9 && s.protein  <= proteinTarget * 1.1) daysHitProteinTarget++;
    if (s.carbs    >= carbsTarget   * 0.9 && s.carbs    <= carbsTarget   * 1.1) daysHitCarbsTarget++;
    if (s.fat      >= fatTarget     * 0.9 && s.fat      <= fatTarget     * 1.1) daysHitFatTarget++;
  });
  const adherenceRate = daysTracked > 0
    ? Math.round(((daysHitCalorieTarget + daysHitProteinTarget + daysHitCarbsTarget + daysHitFatTarget) / (daysTracked * 4)) * 100)
    : 0;
  return { dailyStats, weeklyAverages, monthlyAverages, consistencyMetrics: { daysTracked, daysHitCalorieTarget, daysHitProteinTarget, daysHitCarbsTarget, daysHitFatTarget, adherenceRate } };
}

// ── Goal Progress ─────────────────────────────────────────────────────────────

export interface GoalProgress {
  currentWeight: number; goalWeight: number; startWeight: number;
  weightLost: number; weightToGo: number; progressPercentage: number;
  daysElapsed: number; daysRemaining: number; estimatedCompletionDate: Date | null;
  weeklyWeightChangeRate: number; isOnTrack: boolean; daysUntilCompletion: number | null;
  fitnessGoal: string;
}

export async function getGoalProgress(userId: number): Promise<GoalProgress | null> {
  const profile = await getUserProfile(userId);
  if (!profile || !profile.goalWeightLbs || !profile.goalDate || !profile.weightLbs) return null;
  const goalWeight = profile.goalWeightLbs;
  const now = new Date();
  const goalDate = new Date(profile.goalDate);
  const weightEntriesData = await getWeightEntries(userId, 365);
  let startWeight = profile.weightLbs;
  let currentWeight = profile.weightLbs;
  if (weightEntriesData.length > 0) {
    const sorted = [...weightEntriesData].sort((a, b) => a.recordedAt - b.recordedAt);
    startWeight = sorted[0].weightLbs;
    currentWeight = sorted[sorted.length - 1].weightLbs;
  }
  const weightLost = startWeight - currentWeight;
  const weightToGo = Math.abs(goalWeight - currentWeight);
  const totalWeightNeeded = Math.abs(goalWeight - startWeight);
  const progressPercentage = totalWeightNeeded > 0
    ? Math.round(((startWeight - currentWeight) / totalWeightNeeded) * 100) : 0;
  const createdAtTime = profile.createdAt instanceof Date ? profile.createdAt.getTime() : new Date(profile.createdAt).getTime();
  const daysElapsed = Math.floor((now.getTime() - createdAtTime) / (1000 * 60 * 60 * 24));
  const daysRemaining = Math.floor((goalDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const weeklyWeightChangeRate = daysElapsed > 0 ? (weightLost / (daysElapsed / 7)) : 0;
  let estimatedCompletionDate: Date | null = null;
  let daysUntilCompletion: number | null = null;
  if (weeklyWeightChangeRate !== 0) {
    const weeksNeeded = Math.abs(weightToGo / weeklyWeightChangeRate);
    const daysNeeded = Math.ceil(weeksNeeded * 7);
    estimatedCompletionDate = new Date(now.getTime() + daysNeeded * 24 * 60 * 60 * 1000);
    daysUntilCompletion = daysNeeded;
  }
  const isOnTrack = estimatedCompletionDate ? estimatedCompletionDate.getTime() <= goalDate.getTime() : daysRemaining > 0;
  return {
    currentWeight, goalWeight, startWeight, weightLost, weightToGo,
    progressPercentage: Math.max(0, Math.min(100, progressPercentage)),
    daysElapsed, daysRemaining, estimatedCompletionDate, weeklyWeightChangeRate,
    isOnTrack, daysUntilCompletion, fitnessGoal: profile.fitnessGoal || "maintain",
  };
}

export async function getWeightHistory(userId: number, days: number = 90): Promise<Array<{ date: string; weight: number }>> {
  const profile = await getUserProfile(userId);
  if (!profile || !profile.weightLbs) return [];
  const now = new Date();
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return [
    { date: startDate.toISOString().split("T")[0], weight: profile.weightLbs },
    { date: now.toISOString().split("T")[0], weight: profile.weightLbs },
  ];
}

// ── Food Search Cache ─────────────────────────────────────────────────────────

export async function getCachedFoodSearchResults(query: string): Promise<any[]> {
  const db = getDb();
  if (!db) return [];
  const now = new Date();
  return db.select().from(foodSearchCache)
    .where(and(eq(foodSearchCache.searchQuery, query.toLowerCase()), gte(foodSearchCache.expiresAt, now)))
    .orderBy(desc(foodSearchCache.createdAt)).limit(10);
}

export async function cacheFoodSearchResults(query: string, foods: any[]): Promise<void> {
  const db = getDb();
  if (!db) return;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);
  const toInsert = foods.map(food => ({
    searchQuery: query.toLowerCase(),
    ...food,
    createdAt: new Date(),
    expiresAt,
  }));
  try {
    await db.delete(foodSearchCache).where(eq(foodSearchCache.searchQuery, query.toLowerCase()));
    await db.insert(foodSearchCache).values(toInsert);
  } catch (err) {
    console.warn("[db.pg] cacheFoodSearchResults error:", err);
  }
}

export async function cleanupExpiredCache(): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await db.delete(foodSearchCache).where(lt(foodSearchCache.expiresAt, new Date()));
  } catch (err) {
    console.warn("[db.pg] cleanupExpiredCache error:", err);
  }
}

export async function clearAllFoodSearchCache(): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  try {
    const all = await db.select({ id: foodSearchCache.id }).from(foodSearchCache);
    const count = all.length;
    await db.delete(foodSearchCache);
    return count;
  } catch (err) {
    console.warn("[db.pg] clearAllFoodSearchCache error:", err);
    return 0;
  }
}

export async function clearWholeFoodSearchCache(): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await db.delete(foodSearchCache).where(
      sql`${foodSearchCache.description} ~ '(Inc\\.|LLC|Corp|Ltd|Branded|Brand|Foods Inc|Co\\.|Company)'`
    );
  } catch (err) {
    console.warn("[db.pg] clearWholeFoodSearchCache error:", err);
  }
}

// ── Progress Photos ───────────────────────────────────────────────────────────

export async function addProgressPhoto(userId: number, photo: any): Promise<any> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(progressPhotos).values({ userId, ...photo });
  const created = await db.select().from(progressPhotos)
    .where(eq(progressPhotos.userId, userId))
    .orderBy(desc(progressPhotos.photoDate)).limit(1);
  if (!created || created.length === 0) throw new Error("Failed to create progress photo");
  return created[0];
}

export async function getProgressPhotos(userId: number): Promise<any[]> {
  const db = getDb();
  if (!db) return [];
  return db.select().from(progressPhotos).where(eq(progressPhotos.userId, userId)).orderBy(desc(progressPhotos.photoDate));
}

export async function deleteProgressPhoto(photoId: number, userId: number): Promise<boolean> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(progressPhotos).where(and(eq(progressPhotos.id, photoId), eq(progressPhotos.userId, userId)));
  return true;
}

export async function updateProgressPhoto(photoId: number, userId: number, updates: any): Promise<any> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const filtered = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
  if (Object.keys(filtered).length > 0) {
    await db.update(progressPhotos).set(filtered).where(and(eq(progressPhotos.id, photoId), eq(progressPhotos.userId, userId)));
  }
  const updated = await db.select().from(progressPhotos).where(eq(progressPhotos.id, photoId)).limit(1);
  if (!updated || updated.length === 0) throw new Error("Failed to update progress photo");
  return updated[0];
}

// ── Glucose / CGM ─────────────────────────────────────────────────────────────

export async function getOrCreateGlucoseSource(userId: number, displayName: string = "Dexcom Clarity"): Promise<number> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select({ id: healthSources.id })
    .from(healthSources)
    .where(and(eq(healthSources.userId, userId), eq(healthSources.displayName as any, displayName)))
    .limit(1);
  if (existing.length > 0) return existing[0].id;
  const inserted = await db.insert(healthSources).values({
    userId,
    provider: "custom_app" as any,
    category: "glucose" as any,
    status: "connected" as any,
    implementationStage: "custom" as any,
    authType: "custom" as any,
    displayName: displayName as any,
    description: `Glucose readings imported from ${displayName}` as any,
    lastSyncStatus: "idle" as any,
    // legacy required columns
    sourceType: "cgm" as any,
    sourceName: displayName as any,
    recordedAt: Date.now() as any,
  } as any).returning({ id: healthSources.id });
  return inserted[0].id;
}

export async function addGlucoseReadings(userId: number, sourceId: number, readings: Array<{ readingAt: number; mgdl: number; trend?: string }>): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const values = readings.map(r => ({
    userId,
    sourceId,
    readingAt: r.readingAt,
    mgdl: r.mgdl,
    trend: r.trend ?? null,
    // legacy columns
    glucoseMgDl: r.mgdl,
    readingType: "cgm",
    recordedAt: r.readingAt,
  } as any));
  await db.insert(glucoseReadings).values(values);
}

export async function getGlucoseReadingsForDateRange(userId: number, startTime: number, endTime: number): Promise<GlucoseReading[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.select().from(glucoseReadings)
    .where(and(eq(glucoseReadings.userId, userId), gte(glucoseReadings.readingAt as any, startTime), lte(glucoseReadings.readingAt as any, endTime)))
    .orderBy(desc(glucoseReadings.readingAt as any));
  return rows.map(r => ({
    id: r.id,
    userId: r.userId,
    sourceId: (r as any).sourceId ?? null,
    readingAt: Number((r as any).readingAt ?? (r as any).recordedAt ?? 0),
    mgdl: (r as any).mgdl ?? (r as any).glucoseMgDl ?? 0,
    trend: (r as any).trend ?? null,
    mealContext: (r as any).mealContext ?? null,
    notes: r.notes ?? null,
    createdAt: r.createdAt,
  }));
}

export async function calculateGlucoseStatistics(readings: GlucoseReading[]) {
  if (readings.length === 0) {
    return { count: 0, average: 0, min: 0, max: 0, stdDev: 0, timeInRange: 0, timeAboveRange: 0, timeBelowRange: 0, a1cEstimate: 0, timeRange: { start: null, end: null } };
  }
  const values = readings.map(r => r.mgdl ?? 0);
  const average = values.reduce((a, b) => a + b, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const variance = values.reduce((sum, val) => sum + Math.pow(val - average, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  const inRange = values.filter(v => v >= 80 && v <= 160).length;
  const aboveRange = values.filter(v => v > 160).length;
  const belowRange = values.filter(v => v < 80).length;
  const timeInRange = (inRange / values.length) * 100;
  const timeAboveRange = (aboveRange / values.length) * 100;
  const timeBelowRange = (belowRange / values.length) * 100;
  const a1cEstimate = (average + 46.7) / 28.7;
  return {
    count: readings.length,
    average: Math.round(average * 10) / 10,
    min, max,
    stdDev: Math.round(stdDev * 10) / 10,
    timeInRange: Math.round(timeInRange * 10) / 10,
    timeAboveRange: Math.round(timeAboveRange * 10) / 10,
    timeBelowRange: Math.round(timeBelowRange * 10) / 10,
    a1cEstimate: Math.round(a1cEstimate * 100) / 100,
    timeRange: {
      start: new Date(readings[readings.length - 1].readingAt ?? 0).toISOString(),
      end: new Date(readings[0].readingAt ?? 0).toISOString(),
    },
  };
}

const MANUAL_GLUCOSE_SOURCE_NAME = "Manual Entry";

async function ensureManualGlucoseSource(userId: number): Promise<number> {
  return getOrCreateGlucoseSource(userId, MANUAL_GLUCOSE_SOURCE_NAME);
}

export async function addManualGlucoseEntry(userId: number, mgdl: number, readingAt: number, notes?: string): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const sourceId = await ensureManualGlucoseSource(userId);
  await db.insert(glucoseReadings).values({
    userId, sourceId, readingAt, mgdl, notes: notes ?? null,
    glucoseMgDl: mgdl, readingType: "manual", recordedAt: readingAt,
  } as any);
}

export async function getTodayManualGlucoseEntries(userId: number, dayStart: number): Promise<GlucoseReading[]> {
  const db = getDb();
  if (!db) return [];
  const sourceRows = await db.select({ id: healthSources.id })
    .from(healthSources)
    .where(and(eq(healthSources.userId, userId), eq(healthSources.displayName as any, MANUAL_GLUCOSE_SOURCE_NAME)))
    .limit(1);
  if (sourceRows.length === 0) return [];
  const rows = await db.select().from(glucoseReadings)
    .where(and(eq(glucoseReadings.userId, userId), eq((glucoseReadings as any).sourceId, sourceRows[0].id), gte((glucoseReadings as any).readingAt, dayStart)))
    .orderBy(desc((glucoseReadings as any).readingAt));
  return rows.map(r => ({
    id: r.id, userId: r.userId,
    sourceId: (r as any).sourceId ?? null,
    readingAt: Number((r as any).readingAt ?? 0),
    mgdl: (r as any).mgdl ?? (r as any).glucoseMgDl ?? 0,
    trend: (r as any).trend ?? null,
    mealContext: (r as any).mealContext ?? null,
    notes: r.notes ?? null,
    createdAt: r.createdAt,
  }));
}

export async function deleteManualGlucoseEntry(id: number, userId: number): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const result = await db.delete(glucoseReadings)
    .where(and(eq(glucoseReadings.id, id), eq(glucoseReadings.userId, userId)));
  return (result as any).rowCount > 0;
}

export async function getCGMStats(userId: number, days: number = 30) {
  const db = getDb();
  if (!db) return null;
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const rows = await db.select().from(glucoseReadings)
    .where(and(eq(glucoseReadings.userId, userId), gte((glucoseReadings as any).readingAt, since)))
    .orderBy(desc((glucoseReadings as any).readingAt));
  if (rows.length === 0) return null;
  const values = rows.map(r => (r as any).mgdl ?? (r as any).glucoseMgDl ?? 0);
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  const inRange = values.filter(v => v >= 70 && v <= 180).length;
  const above = values.filter(v => v > 180).length;
  const below = values.filter(v => v < 70).length;
  const a1c = Math.round(((avg / 28.7) + 2.15) * 100) / 100;
  return {
    count: rows.length,
    average: Math.round(avg),
    min: Math.round(Math.min(...values)),
    max: Math.round(Math.max(...values)),
    timeInRange: Math.round((inRange / values.length) * 100),
    timeAboveRange: Math.round((above / values.length) * 100),
    timeBelowRange: Math.round((below / values.length) * 100),
    a1cEstimate: Math.max(4, Math.min(12, a1c)),
    latestReading: (rows[0] as any)?.mgdl ?? null,
    latestAt: (rows[0] as any)?.readingAt ?? null,
  };
}

export async function getCGMDailyAverages(userId: number, days: number = 7): Promise<{ date: string; avg: number; min: number; max: number }[]> {
  const db = getDb();
  if (!db) return [];
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const rows = await db.select().from(glucoseReadings)
    .where(and(eq(glucoseReadings.userId, userId), gte((glucoseReadings as any).readingAt, since)))
    .orderBy((glucoseReadings as any).readingAt);
  const byDay = new Map<string, number[]>();
  for (const r of rows) {
    const day = new Date((r as any).readingAt ?? 0).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push((r as any).mgdl ?? (r as any).glucoseMgDl ?? 0);
  }
  return Array.from(byDay.entries()).map(([date, vals]) => ({
    date,
    avg: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length),
    min: Math.round(Math.min(...vals)),
    max: Math.round(Math.max(...vals)),
  }));
}

// ── Step Counter ──────────────────────────────────────────────────────────────

const PEDOMETER_SOURCE_NAME = "Built-in Pedometer";

async function ensurePedometerSource(userId: number): Promise<number> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select({ id: healthSources.id })
    .from(healthSources)
    .where(and(eq(healthSources.userId, userId), eq(healthSources.displayName as any, PEDOMETER_SOURCE_NAME)))
    .limit(1);
  if (existing.length > 0) return existing[0].id;
  const inserted = await db.insert(healthSources).values({
    userId,
    provider: "custom_app" as any,
    category: "activity" as any,
    status: "connected" as any,
    implementationStage: "custom" as any,
    authType: "custom" as any,
    displayName: PEDOMETER_SOURCE_NAME as any,
    description: "Steps counted directly by the HumanAIze app accelerometer" as any,
    lastSyncStatus: "idle" as any,
    sourceType: "pedometer" as any,
    sourceName: PEDOMETER_SOURCE_NAME as any,
    recordedAt: Date.now() as any,
  } as any).returning({ id: healthSources.id });
  return inserted[0].id;
}

export async function logStepsForDay(userId: number, steps: number, dayStart: number): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const sourceId = await ensurePedometerSource(userId);
  const existing = await db.select({ id: activitySamples.id })
    .from(activitySamples)
    .where(and(eq(activitySamples.userId, userId), eq((activitySamples as any).sourceId, sourceId), eq((activitySamples as any).sampleDate, dayStart)))
    .limit(1);
  if (existing.length > 0) {
    await db.update(activitySamples).set({ steps } as any).where(eq(activitySamples.id, existing[0].id));
  } else {
    await db.insert(activitySamples).values({
      userId, sourceId, sampleDate: dayStart, steps,
      activeMinutes: 0, caloriesBurned: 0, workoutMinutes: 0, distanceKm: 0,
      sourceLabel: PEDOMETER_SOURCE_NAME,
      // legacy columns
      activeCalories: 0, distanceMiles: 0, recordedAt: dayStart,
    } as any);
  }
}

export async function getTodaySteps(userId: number, dayStart: number): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const sourceId = await ensurePedometerSource(userId);
  const result = await db.select({ steps: activitySamples.steps })
    .from(activitySamples)
    .where(and(eq(activitySamples.userId, userId), eq((activitySamples as any).sourceId, sourceId), eq((activitySamples as any).sampleDate, dayStart)))
    .limit(1);
  return result.length > 0 ? result[0].steps : 0;
}

export async function getStepHistory(userId: number, startDate: number, endDate: number): Promise<{ date: number; steps: number }[]> {
  const db = getDb();
  if (!db) return [];
  const sourceId = await ensurePedometerSource(userId);
  const rows = await db.select({ sampleDate: (activitySamples as any).sampleDate, steps: activitySamples.steps })
    .from(activitySamples)
    .where(and(eq(activitySamples.userId, userId), eq((activitySamples as any).sourceId, sourceId), gte((activitySamples as any).sampleDate, startDate), lte((activitySamples as any).sampleDate, endDate)))
    .orderBy(desc((activitySamples as any).sampleDate));
  return rows.map(r => ({ date: r.sampleDate, steps: r.steps }));
}

// ── Workout Entries ───────────────────────────────────────────────────────────

export async function addWorkoutEntry(userId: number, entry: {
  exerciseName: string; exerciseType: string; durationMinutes: number;
  caloriesBurned?: number; intensity?: string; notes?: string; recordedAt?: number;
}): Promise<any> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const recordedAt = entry.recordedAt ?? Date.now();
  await db.insert(workoutEntries).values({
    userId,
    exerciseName: entry.exerciseName,
    exerciseType: entry.exerciseType,
    durationMinutes: entry.durationMinutes,
    caloriesBurned: entry.caloriesBurned ?? 0,
    intensity: entry.intensity ?? "moderate",
    notes: entry.notes ?? null,
    recordedAt,
  });
  const created = await db.select().from(workoutEntries)
    .where(eq(workoutEntries.userId, userId))
    .orderBy(desc(workoutEntries.recordedAt)).limit(1);
  if (!created || created.length === 0) throw new Error("Failed to create workout entry");
  return created[0];
}

export async function getWorkoutEntries(userId: number, days: number = 30): Promise<any[]> {
  const db = getDb();
  if (!db) return [];
  const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;
  try {
    return await db.select().from(workoutEntries)
      .where(and(eq(workoutEntries.userId, userId), gte(workoutEntries.recordedAt, cutoffTime)))
      .orderBy(desc(workoutEntries.recordedAt));
  } catch (err) {
    console.error("[db.pg] getWorkoutEntries error:", err);
    return [];
  }
}

export async function deleteWorkoutEntry(entryId: number, userId: number): Promise<boolean> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(workoutEntries).where(and(eq(workoutEntries.id, entryId), eq(workoutEntries.userId, userId)));
  return true;
}

// ── Weight Entries ────────────────────────────────────────────────────────────

export async function addWeightEntry(userId: number, weightLbs: number, recordedAt: number, notes?: string): Promise<any> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(weightEntries).values({ userId, weightLbs, recordedAt, notes: notes ?? null });
  const created = await db.select().from(weightEntries)
    .where(eq(weightEntries.userId, userId))
    .orderBy(desc(weightEntries.recordedAt)).limit(1);
  if (!created || created.length === 0) throw new Error("Failed to create weight entry");
  return created[0];
}

export async function getWeightEntries(userId: number, days: number = 90): Promise<any[]> {
  const db = getDb();
  if (!db) return [];
  const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;
  try {
    return await db.select().from(weightEntries)
      .where(and(eq(weightEntries.userId, userId), gte(weightEntries.recordedAt, cutoffTime)))
      .orderBy(desc(weightEntries.recordedAt));
  } catch (err) {
    console.error("[db.pg] getWeightEntries error:", err);
    return [];
  }
}

export async function deleteWeightEntry(entryId: number, userId: number): Promise<boolean> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(weightEntries).where(and(eq(weightEntries.id, entryId), eq(weightEntries.userId, userId)));
  return true;
}

export async function getWeightProgressData(userId: number, days: number = 90): Promise<Array<{ date: string; weight: number }>> {
  const entries = await getWeightEntries(userId, days);
  if (entries.length === 0) return [];
  const sorted = [...entries].sort((a, b) => a.recordedAt - b.recordedAt);
  return sorted.map(entry => ({
    date: new Date(entry.recordedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    weight: entry.weightLbs,
  }));
}

// ── Body Measurements ─────────────────────────────────────────────────────────

export async function addBodyMeasurement(userId: number, chest?: number, waist?: number, hips?: number, notes?: string): Promise<any | null> {
  const db = getDb();
  if (!db) return null;
  const result = await db.insert(bodyMeasurements).values({
    userId,
    chestInches: chest,
    waistInches: waist,
    hipsInches: hips,
    recordedAt: Date.now(),
    notes,
  }).returning();
  return result[0] ?? null;
}

export async function getBodyMeasurements(userId: number, limit: number = 100): Promise<any[]> {
  const db = getDb();
  if (!db) return [];
  return db.select().from(bodyMeasurements)
    .where(eq(bodyMeasurements.userId, userId))
    .orderBy(desc(bodyMeasurements.recordedAt))
    .limit(limit);
}

export async function deleteBodyMeasurement(id: number, userId: number): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const result = await db.delete(bodyMeasurements)
    .where(and(eq(bodyMeasurements.id, id), eq(bodyMeasurements.userId, userId)));
  return (result as any).rowCount > 0;
}

export async function getBodyMeasurementTrends(userId: number, days: number = 30): Promise<{
  chest: { current?: number; previous?: number; change?: number };
  waist: { current?: number; previous?: number; change?: number };
  hips: { current?: number; previous?: number; change?: number };
}> {
  const db = getDb();
  if (!db) return { chest: {}, waist: {}, hips: {} };
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const measurements = await db.select().from(bodyMeasurements)
    .where(and(eq(bodyMeasurements.userId, userId), gte(bodyMeasurements.recordedAt, since)))
    .orderBy(desc(bodyMeasurements.recordedAt));
  if (measurements.length === 0) return { chest: {}, waist: {}, hips: {} };
  const latest = measurements[0];
  const oldest = measurements[measurements.length - 1];
  return {
    chest: { current: latest.chestInches ?? undefined, previous: oldest.chestInches ?? undefined, change: latest.chestInches && oldest.chestInches ? latest.chestInches - oldest.chestInches : undefined },
    waist: { current: latest.waistInches ?? undefined, previous: oldest.waistInches ?? undefined, change: latest.waistInches && oldest.waistInches ? latest.waistInches - oldest.waistInches : undefined },
    hips:  { current: latest.hipsInches  ?? undefined, previous: oldest.hipsInches  ?? undefined, change: latest.hipsInches  && oldest.hipsInches  ? latest.hipsInches  - oldest.hipsInches  : undefined },
  };
}

// ── Recent Food Logs for Insights ─────────────────────────────────────────────

export async function getRecentFoodLogsForInsights(userId: number, days: number = 7): Promise<any[]> {
  const db = getDb();
  if (!db) return [];
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  return db.select().from(foodLogs)
    .where(and(eq(foodLogs.userId, userId), gte(foodLogs.loggedAt, since)))
    .orderBy(desc(foodLogs.loggedAt)).limit(50);
}

// ── Grocery Items ─────────────────────────────────────────────────────────────

export async function getGroceryItems(userId: number): Promise<any[]> {
  const db = getDb();
  if (!db) return [];
  return db.select().from(groceryItems).where(eq(groceryItems.userId, userId)).orderBy(groceryItems.category, groceryItems.name);
}

export async function addGroceryItem(userId: number, item: any): Promise<any> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const toInsert = {
    userId,
    ...item,
    isChecked: item.isChecked ?? false,
    isAiSuggested: item.isAiSuggested ?? true,
  };
  await db.insert(groceryItems).values(toInsert);
  const created = await db.select().from(groceryItems).where(eq(groceryItems.userId, userId)).orderBy(desc(groceryItems.id)).limit(1);
  return created[0];
}

export async function bulkReplaceGroceryItems(userId: number, items: any[]): Promise<any[]> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(groceryItems).where(and(eq(groceryItems.userId, userId), eq(groceryItems.isAiSuggested, true)));
  if (items.length > 0) {
    await db.insert(groceryItems).values(items.map(i => ({ userId, ...i, isChecked: false, isAiSuggested: true })));
  }
  return db.select().from(groceryItems).where(eq(groceryItems.userId, userId)).orderBy(groceryItems.category, groceryItems.name);
}

export async function updateGroceryItemChecked(id: number, userId: number, isChecked: boolean): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.update(groceryItems).set({ isChecked }).where(and(eq(groceryItems.id, id), eq(groceryItems.userId, userId)));
}

export async function deleteGroceryItem(id: number, userId: number): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.delete(groceryItems).where(and(eq(groceryItems.id, id), eq(groceryItems.userId, userId)));
}

export async function clearCheckedGroceryItems(userId: number): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.delete(groceryItems).where(and(eq(groceryItems.userId, userId), eq(groceryItems.isChecked, true)));
}
