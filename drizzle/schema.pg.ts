/**
 * PostgreSQL schema for HumanAIze — Neon Database
 * Replaces the MySQL/Azure SQL schema with clean PostgreSQL types.
 *
 * NOTE: This schema mirrors the ACTUAL columns that exist in Neon (including
 * columns added via ALTER TABLE migrations).  The "extra" columns (heightIn,
 * ageYears, openId, sourceId, mgdl, etc.) are kept as optional so that
 * drizzle-orm can read/write them without type errors.
 */
import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  bigint,
  doublePrecision,
  boolean,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";

// ── Enums ────────────────────────────────────────────────────────────────────
export const mealTypeEnum = pgEnum("meal_type", ["breakfast", "lunch", "dinner", "snack", "other"]);
export const foodSourceEnum = pgEnum("food_source", ["gemini", "usda", "open_food_facts", "branded", "usda_generic"]);

// ── Users ────────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 191 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 255 }),   // nullable for OAuth-only users
  name: varchar("name", { length: 191 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  // OAuth / social login columns (added via migration)
  username: varchar("username", { length: 191 }),
  role: varchar("role", { length: 32 }),
  openId: varchar("openId", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  lastSignedIn: timestamp("lastSignedIn"),
});
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ── User Profiles ─────────────────────────────────────────────────────────────
export const userProfiles = pgTable("user_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().references(() => users.id),
  // Primary columns (schema.pg.ts originals)
  heightInches: doublePrecision("heightInches"),
  weightLbs: doublePrecision("weightLbs"),
  goalWeightLbs: doublePrecision("goalWeightLbs"),
  age: integer("age"),
  gender: varchar("gender", { length: 32 }),
  activityLevel: varchar("activityLevel", { length: 64 }),
  fitnessGoal: varchar("fitnessGoal", { length: 128 }),
  goalDate: bigint("goalDate", { mode: "number" }),
  dailyCalorieTarget: integer("dailyCalorieTarget"),
  dailyProteinTarget: integer("dailyProteinTarget"),
  dailyCarbsTarget: integer("dailyCarbsTarget"),
  dailyFatTarget: integer("dailyFatTarget"),
  profilePhotoUrl: text("profilePhotoUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  // Alias columns (added via migration to match legacy app field names)
  heightIn: integer("heightIn"),
  ageYears: integer("ageYears"),
  // Onboarding / health metadata columns (added via migration)
  onboardingCompleted: boolean("onboardingCompleted").default(false),
  geminiPlan: text("geminiPlan"),
  healthConditions: text("healthConditions"),
  diabetesType: varchar("diabetesType", { length: 64 }),
  cgmAverageGlucose: doublePrecision("cgmAverageGlucose"),
  cgmTimeInRange: doublePrecision("cgmTimeInRange"),
  cgmA1cEstimate: doublePrecision("cgmA1cEstimate"),
});
export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = typeof userProfiles.$inferInsert;

// ── Food Logs ─────────────────────────────────────────────────────────────────
export const foodLogs = pgTable("food_logs", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().references(() => users.id),
  mealType: mealTypeEnum("mealType").notNull(),
  foodName: varchar("foodName", { length: 255 }).notNull(),
  servingSize: varchar("servingSize", { length: 120 }).default("100g").notNull(),
  calories: integer("calories").notNull(),
  proteinGrams: doublePrecision("proteinGrams").notNull(),
  carbsGrams: doublePrecision("carbsGrams").notNull(),
  fatGrams: doublePrecision("fatGrams").notNull(),
  logDate: varchar("logDate", { length: 10 }).notNull(), // YYYY-MM-DD
  loggedAt: bigint("loggedAt", { mode: "number" }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  // Extra columns added via migration
  sugarGrams: doublePrecision("sugarGrams"),
  notes: text("notes"),
  source: foodSourceEnum("source"),
});
export type FoodLog = typeof foodLogs.$inferSelect;
export type InsertFoodLog = typeof foodLogs.$inferInsert;

// ── Health Sources ────────────────────────────────────────────────────────────
export const healthSources = pgTable("health_sources", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().references(() => users.id),
  // Legacy required columns
  sourceType: varchar("sourceType", { length: 64 }).notNull(),
  sourceName: varchar("sourceName", { length: 191 }).notNull(),
  data: text("data"),
  recordedAt: bigint("recordedAt", { mode: "number" }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  // Extended columns added via migration
  provider: varchar("provider", { length: 64 }).notNull().default(""),
  category: varchar("category", { length: 64 }),
  status: varchar("status", { length: 32 }),
  implementationStage: varchar("implementationStage", { length: 64 }),
  authType: varchar("authType", { length: 64 }),
  displayName: varchar("displayName", { length: 191 }),
  description: text("description"),
  lastSyncStatus: varchar("lastSyncStatus", { length: 32 }),
  // OAuth / sync columns (added via migration)
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  externalUserId: varchar("externalUserId", { length: 191 }),
  tokenExpiresAt: bigint("tokenExpiresAt", { mode: "number" }),
  lastSyncAt: bigint("lastSyncAt", { mode: "number" }),
  lastError: text("lastError"),
  metadata: text("metadata"),  // JSON stored as text
});

// ── Favorite Foods ────────────────────────────────────────────────────────────
export const favoriteFoods = pgTable("favorite_foods", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().references(() => users.id),
  foodName: varchar("foodName", { length: 255 }).notNull(),
  servingSize: varchar("servingSize", { length: 120 }).default("100g").notNull(),
  calories: integer("calories").notNull(),
  proteinGrams: doublePrecision("proteinGrams").notNull(),
  carbsGrams: doublePrecision("carbsGrams").notNull(),
  fatGrams: doublePrecision("fatGrams").notNull(),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  // Extra column added via migration
  source: varchar("source", { length: 64 }),
});
export type FavoriteFood = typeof favoriteFoods.$inferSelect;
export type InsertFavoriteFood = typeof favoriteFoods.$inferInsert;

// ── Meal Templates ────────────────────────────────────────────────────────────
export const mealTemplates = pgTable("meal_templates", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().references(() => users.id),
  name: varchar("name", { length: 191 }).notNull(),
  mealType: mealTypeEnum("mealType").notNull(),
  foods: text("foods").notNull(), // JSON array of food items
  totalCalories: integer("totalCalories").notNull(),
  totalProtein: doublePrecision("totalProtein").notNull(),
  totalCarbs: doublePrecision("totalCarbs").notNull(),
  totalFat: doublePrecision("totalFat").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  // Alias columns added via migration
  mealName: varchar("mealName", { length: 191 }),
  notes: text("notes"),
  totalProteinGrams: doublePrecision("totalProteinGrams"),
  totalCarbsGrams: doublePrecision("totalCarbsGrams"),
  totalFatGrams: doublePrecision("totalFatGrams"),
});
export type MealTemplate = typeof mealTemplates.$inferSelect;
export type InsertMealTemplate = typeof mealTemplates.$inferInsert;

// ── Food Search Cache ─────────────────────────────────────────────────────────
export const foodSearchCache = pgTable("food_search_cache", {
  id: serial("id").primaryKey(),
  searchQuery: varchar("searchQuery", { length: 191 }).notNull(),
  foodName: varchar("foodName", { length: 191 }).notNull(),
  description: text("description"),
  calories: integer("calories").notNull(),
  proteinGrams: doublePrecision("proteinGrams").notNull(),
  carbsGrams: doublePrecision("carbsGrams").notNull(),
  fatGrams: doublePrecision("fatGrams").notNull(),
  servingSize: varchar("servingSize", { length: 120 }).default("100g").notNull(),
  source: foodSourceEnum("source").default("gemini").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
});
export type FoodSearchCache = typeof foodSearchCache.$inferSelect;
export type InsertFoodSearchCache = typeof foodSearchCache.$inferInsert;

// ── Progress Photos ───────────────────────────────────────────────────────────
export const progressPhotos = pgTable("progress_photos", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().references(() => users.id),
  photoUrl: text("photoUrl").notNull(),
  photoKey: varchar("photoKey", { length: 255 }).notNull(),
  photoName: varchar("photoName", { length: 191 }).notNull(),
  photoDate: bigint("photoDate", { mode: "number" }).notNull(),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type ProgressPhoto = typeof progressPhotos.$inferSelect;
export type InsertProgressPhoto = typeof progressPhotos.$inferInsert;

// ── Weight Entries ────────────────────────────────────────────────────────────
export const weightEntries = pgTable("weight_entries", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().references(() => users.id),
  weightLbs: integer("weightLbs").notNull(),
  recordedAt: bigint("recordedAt", { mode: "number" }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type WeightEntry = typeof weightEntries.$inferSelect;
export type InsertWeightEntry = typeof weightEntries.$inferInsert;

// ── Workout Entries ───────────────────────────────────────────────────────────
export const workoutEntries = pgTable("workout_entries", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().references(() => users.id),
  exerciseName: varchar("exerciseName", { length: 191 }).notNull(),
  exerciseType: varchar("exerciseType", { length: 64 }).notNull(),
  durationMinutes: integer("durationMinutes").notNull(),
  caloriesBurned: integer("caloriesBurned").default(0).notNull(),
  intensity: varchar("intensity", { length: 32 }).default("moderate").notNull(),
  notes: text("notes"),
  sets: integer("sets"),
  reps: integer("reps"),
  weightLbs: doublePrecision("weightLbs"),
  recordedAt: bigint("recordedAt", { mode: "number" }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type WorkoutEntry = typeof workoutEntries.$inferSelect;
export type InsertWorkoutEntry = typeof workoutEntries.$inferInsert;

// ── Body Measurements ─────────────────────────────────────────────────────────
export const bodyMeasurements = pgTable("body_measurements", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().references(() => users.id),
  chestInches: doublePrecision("chestInches"),
  waistInches: doublePrecision("waistInches"),
  hipsInches: doublePrecision("hipsInches"),
  recordedAt: bigint("recordedAt", { mode: "number" }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type BodyMeasurement = typeof bodyMeasurements.$inferSelect;
export type InsertBodyMeasurement = typeof bodyMeasurements.$inferInsert;

// ── Glucose Readings ──────────────────────────────────────────────────────────
// This table has BOTH the original schema columns AND the extended columns
// added via ALTER TABLE migration (sourceId, mgdl, trend, mealContext, readingAt).
export const glucoseReadings = pgTable("glucose_readings", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().references(() => users.id),
  // Original columns
  glucoseMgDl: integer("glucoseMgDl"),
  readingType: varchar("readingType", { length: 64 }).default("manual"),
  recordedAt: bigint("recordedAt", { mode: "number" }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  // Extended columns (added via migration)
  sourceId: integer("sourceId"),
  mgdl: integer("mgdl").notNull().default(0),
  trend: varchar("trend", { length: 32 }),
  mealContext: varchar("mealContext", { length: 64 }),
  readingAt: bigint("readingAt", { mode: "number" }).notNull().default(0),
});
export type GlucoseReading = typeof glucoseReadings.$inferSelect;

// ── Activity Samples ──────────────────────────────────────────────────────────
// Extended to include sourceId, sampleDate, and additional activity fields.
export const activitySamples = pgTable("activity_samples", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().references(() => users.id),
  // Original columns
  steps: integer("steps").default(0).notNull(),
  activeCalories: integer("activeCalories").default(0).notNull(),
  distanceMiles: doublePrecision("distanceMiles").default(0).notNull(),
  recordedAt: bigint("recordedAt", { mode: "number" }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  // Extended columns (added via migration)
  sourceId: integer("sourceId"),
  sampleDate: bigint("sampleDate", { mode: "number" }),
  activeMinutes: integer("activeMinutes").default(0),
  caloriesBurned: integer("caloriesBurned").default(0),
  workoutMinutes: integer("workoutMinutes").default(0),
  distanceKm: doublePrecision("distanceKm").default(0),
  sourceLabel: varchar("sourceLabel", { length: 191 }),
});

// ── Grocery Items ─────────────────────────────────────────────────────────────
export const groceryItems = pgTable("grocery_items", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().references(() => users.id),
  name: varchar("name", { length: 191 }).notNull(),
  category: varchar("category", { length: 64 }).notNull().default("other"),
  caloriesPer100g: doublePrecision("caloriesPer100g").default(0),
  proteinPer100g: doublePrecision("proteinPer100g").default(0),
  carbsPer100g: doublePrecision("carbsPer100g").default(0),
  fatPer100g: doublePrecision("fatPer100g").default(0),
  suggestedQty: varchar("suggestedQty", { length: 64 }),
  notes: varchar("notes", { length: 255 }),
  isChecked: boolean("isChecked").default(false).notNull(),
  isAiSuggested: boolean("isAiSuggested").default(true).notNull(),
  addedAt: timestamp("addedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type GroceryItem = typeof groceryItems.$inferSelect;
export type InsertGroceryItem = typeof groceryItems.$inferInsert;

// ── Sync Jobs ─────────────────────────────────────────────────────────────────
export const syncJobs = pgTable("sync_jobs", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  sourceId: integer("sourceId"),
  syncType: varchar("syncType", { length: 32 }).default("manual"),
  status: varchar("status", { length: 32 }).notNull().default("queued"),
  startedAt: bigint("startedAt", { mode: "number" }),
  finishedAt: bigint("finishedAt", { mode: "number" }),
  recordCount: integer("recordCount").default(0),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SyncJob = typeof syncJobs.$inferSelect;
export type InsertSyncJob = typeof syncJobs.$inferInsert;

// ── Nutrition Logs (legacy alias for food_logs) ───────────────────────────────
export const nutritionLogs = pgTable("nutrition_logs", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  foodName: varchar("foodName", { length: 255 }).notNull(),
  calories: integer("calories").notNull().default(0),
  proteinGrams: doublePrecision("proteinGrams").notNull().default(0),
  carbsGrams: doublePrecision("carbsGrams").notNull().default(0),
  fatGrams: doublePrecision("fatGrams").notNull().default(0),
  loggedAt: bigint("loggedAt", { mode: "number" }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type NutritionLog = typeof nutritionLogs.$inferSelect;

// ── Sleep Sessions ────────────────────────────────────────────────────────────
export const sleepSessions = pgTable("sleep_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  sourceId: integer("sourceId"),
  sleepStartAt: bigint("sleepStartAt", { mode: "number" }).notNull(),
  sleepEndAt: bigint("sleepEndAt", { mode: "number" }).notNull(),
  durationMinutes: integer("durationMinutes").notNull(),
  efficiency: doublePrecision("efficiency").default(0).notNull(),
  score: integer("score").default(0).notNull(),
  restingHeartRate: integer("restingHeartRate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SleepSession = typeof sleepSessions.$inferSelect;

// ── AI Insights ───────────────────────────────────────────────────────────────
export const aiInsights = pgTable("ai_insights", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  title: varchar("title", { length: 191 }).notNull(),
  summary: text("summary").notNull(),
  severity: varchar("severity", { length: 32 }).default("info").notNull(),
  evidence: text("evidence"),  // JSON stored as text
  recommendation: text("recommendation").notNull(),
  generatedAt: bigint("generatedAt", { mode: "number" }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AiInsight = typeof aiInsights.$inferSelect;

// ── Chat Threads ──────────────────────────────────────────────────────────────
export const chatThreads = pgTable("chat_threads", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  title: varchar("title", { length: 191 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type ChatThread = typeof chatThreads.$inferSelect;

// ── Chat Messages ─────────────────────────────────────────────────────────────
export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  threadId: integer("threadId").notNull(),
  role: varchar("role", { length: 32 }).notNull(),
  content: text("content").notNull(),
  citedMetricWindow: text("citedMetricWindow"),  // JSON stored as text
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ChatMessage = typeof chatMessages.$inferSelect;

// ── Weekly Summaries ──────────────────────────────────────────────────────────
export const weeklySummaries = pgTable("weekly_summaries", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  weekStartAt: bigint("weekStartAt", { mode: "number" }).notNull(),
  weekEndAt: bigint("weekEndAt", { mode: "number" }).notNull(),
  subject: varchar("subject", { length: 191 }).notNull(),
  summaryMarkdown: text("summaryMarkdown").notNull(),
  deliveryStatus: varchar("deliveryStatus", { length: 64 }).default("needs_email_provider").notNull(),
  deliveredAt: bigint("deliveredAt", { mode: "number" }),
  generationContext: text("generationContext"),  // JSON stored as text
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type WeeklySummary = typeof weeklySummaries.$inferSelect;

// ── Insight Preferences ───────────────────────────────────────────────────────
export const insightPreferences = pgTable("insight_preferences", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().unique(),
  weeklyEmailEnabled: boolean("weeklyEmailEnabled").default(true).notNull(),
  summaryDayOfWeek: integer("summaryDayOfWeek").default(1).notNull(),
  summaryHourUtc: integer("summaryHourUtc").default(13).notNull(),
  timezone: varchar("timezone", { length: 64 }).default("UTC").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type InsightPreference = typeof insightPreferences.$inferSelect;
