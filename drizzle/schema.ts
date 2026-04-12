import {
  bigint,
  boolean,
  double,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const healthSources = mysqlTable("health_sources", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  provider: mysqlEnum("provider", [
    "dexcom",
    "glooko",
    "fitbit",
    "google_fit",
    "apple_health",
    "myfitnesspal",
    "cronometer",
    "oura",
    "custom_app",
  ]).notNull(),
  category: mysqlEnum("category", ["glucose", "activity", "nutrition", "sleep", "multi"]).notNull(),
  status: mysqlEnum("status", ["ready", "connected", "syncing", "attention", "planned"]).default("ready").notNull(),
  implementationStage: mysqlEnum("implementationStage", ["direct_oauth", "partner_required", "native_bridge", "legacy", "planned", "custom"]).notNull(),
  authType: mysqlEnum("authType", ["oauth2", "partner", "native_bridge", "manual", "legacy", "custom"]).notNull(),
  displayName: varchar("displayName", { length: 120 }).notNull(),
  description: text("description").notNull(),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  externalUserId: varchar("externalUserId", { length: 191 }),
  tokenExpiresAt: bigint("tokenExpiresAt", { mode: "number" }),
  lastSyncAt: bigint("lastSyncAt", { mode: "number" }),
  lastSyncStatus: mysqlEnum("lastSyncStatus", ["idle", "success", "error", "pending"]).default("idle").notNull(),
  lastError: text("lastError"),
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const syncJobs = mysqlTable("sync_jobs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  sourceId: int("sourceId").notNull().references(() => healthSources.id),
  syncType: mysqlEnum("syncType", ["initial", "manual", "scheduled", "backfill"]).default("manual").notNull(),
  status: mysqlEnum("status", ["queued", "running", "success", "error"]).default("queued").notNull(),
  startedAt: bigint("startedAt", { mode: "number" }).notNull(),
  finishedAt: bigint("finishedAt", { mode: "number" }),
  recordCount: int("recordCount").default(0).notNull(),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const glucoseReadings = mysqlTable("glucose_readings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  sourceId: int("sourceId").notNull().references(() => healthSources.id),
  readingAt: bigint("readingAt", { mode: "number" }).notNull(),
  mgdl: double("mgdl").notNull(),
  trend: varchar("trend", { length: 64 }),
  mealContext: varchar("mealContext", { length: 120 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const activitySamples = mysqlTable("activity_samples", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  sourceId: int("sourceId").notNull().references(() => healthSources.id),
  sampleDate: bigint("sampleDate", { mode: "number" }).notNull(),
  steps: int("steps").default(0).notNull(),
  activeMinutes: int("activeMinutes").default(0).notNull(),
  caloriesBurned: int("caloriesBurned").default(0).notNull(),
  workoutMinutes: int("workoutMinutes").default(0).notNull(),
  distanceKm: double("distanceKm").default(0).notNull(),
  sourceLabel: varchar("sourceLabel", { length: 120 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const nutritionLogs = mysqlTable("nutrition_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  sourceId: int("sourceId").notNull().references(() => healthSources.id),
  loggedAt: bigint("loggedAt", { mode: "number" }).notNull(),
  mealName: varchar("mealName", { length: 191 }).notNull(),
  calories: int("calories").default(0).notNull(),
  carbs: double("carbs").default(0).notNull(),
  protein: double("protein").default(0).notNull(),
  fat: double("fat").default(0).notNull(),
  fiber: double("fiber").default(0).notNull(),
  sugar: double("sugar").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const sleepSessions = mysqlTable("sleep_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  sourceId: int("sourceId").notNull().references(() => healthSources.id),
  sleepStartAt: bigint("sleepStartAt", { mode: "number" }).notNull(),
  sleepEndAt: bigint("sleepEndAt", { mode: "number" }).notNull(),
  durationMinutes: int("durationMinutes").notNull(),
  efficiency: double("efficiency").default(0).notNull(),
  score: int("score").default(0).notNull(),
  restingHeartRate: int("restingHeartRate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const aiInsights = mysqlTable("ai_insights", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  title: varchar("title", { length: 191 }).notNull(),
  summary: text("summary").notNull(),
  severity: mysqlEnum("severity", ["info", "watch", "priority"]).default("info").notNull(),
  evidence: json("evidence"),
  recommendation: text("recommendation").notNull(),
  generatedAt: bigint("generatedAt", { mode: "number" }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const chatThreads = mysqlTable("chat_threads", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  title: varchar("title", { length: 191 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const chatMessages = mysqlTable("chat_messages", {
  id: int("id").autoincrement().primaryKey(),
  threadId: int("threadId").notNull().references(() => chatThreads.id),
  role: mysqlEnum("role", ["user", "assistant", "system"]).notNull(),
  content: text("content").notNull(),
  citedMetricWindow: json("citedMetricWindow"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const weeklySummaries = mysqlTable("weekly_summaries", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  weekStartAt: bigint("weekStartAt", { mode: "number" }).notNull(),
  weekEndAt: bigint("weekEndAt", { mode: "number" }).notNull(),
  subject: varchar("subject", { length: 191 }).notNull(),
  summaryMarkdown: text("summaryMarkdown").notNull(),
  deliveryStatus: mysqlEnum("deliveryStatus", ["scheduled", "generated", "queued", "needs_email_provider", "sent", "error"]).default("needs_email_provider").notNull(),
  deliveredAt: bigint("deliveredAt", { mode: "number" }),
  generationContext: json("generationContext"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const insightPreferences = mysqlTable("insight_preferences", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id).unique(),
  weeklyEmailEnabled: boolean("weeklyEmailEnabled").default(true).notNull(),
  summaryDayOfWeek: int("summaryDayOfWeek").default(1).notNull(),
  summaryHourUtc: int("summaryHourUtc").default(13).notNull(),
  timezone: varchar("timezone", { length: 64 }).default("UTC").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const userProfiles = mysqlTable("user_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id).unique(),
  heightIn: int("heightIn"),
  weightLbs: int("weightLbs"),
  ageYears: int("ageYears"),
  fitnessGoal: mysqlEnum("fitnessGoal", ["lose_fat", "build_muscle", "maintain"]),
  goalWeightLbs: int("goalWeightLbs"),
  goalDate: bigint("goalDate", { mode: "number" }),
  dailyCalorieTarget: int("dailyCalorieTarget"),
  dailyProteinTarget: int("dailyProteinTarget"),
  dailyCarbsTarget: int("dailyCarbsTarget"),
  dailyFatTarget: int("dailyFatTarget"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const nutritionPlans = mysqlTable("nutrition_plans", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  startDate: bigint("startDate", { mode: "number" }).notNull(),
  endDate: bigint("endDate", { mode: "number" }).notNull(),
  dailyCalories: int("dailyCalories").notNull(),
  proteinGrams: double("proteinGrams").notNull(),
  carbsGrams: double("carbsGrams").notNull(),
  fatGrams: double("fatGrams").notNull(),
  proteinCalories: int("proteinCalories").notNull(),
  carbsCalories: int("carbsCalories").notNull(),
  fatCalories: int("fatCalories").notNull(),
  fitnessGoal: mysqlEnum("fitnessGoal", ["lose_fat", "build_muscle", "maintain"]).notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const foodLogs = mysqlTable("food_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  foodName: varchar("foodName", { length: 191 }).notNull(),
  servingSize: varchar("servingSize", { length: 120 }),
  calories: int("calories").notNull(),
  proteinGrams: double("proteinGrams").notNull(),
  carbsGrams: double("carbsGrams").notNull(),
  fatGrams: double("fatGrams").notNull(),
  loggedAt: bigint("loggedAt", { mode: "number" }).notNull(),
  mealType: mysqlEnum("mealType", ["breakfast", "lunch", "dinner", "snack", "other"]).default("other").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const favoriteFoods = mysqlTable("favorite_foods", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  foodName: varchar("foodName", { length: 191 }).notNull(),
  servingSize: varchar("servingSize", { length: 120 }).notNull(),
  calories: int("calories").notNull(),
  proteinGrams: double("proteinGrams").notNull(),
  carbsGrams: double("carbsGrams").notNull(),
  fatGrams: double("fatGrams").notNull(),
  source: mysqlEnum("source", ["manual", "ai_recognized", "usda", "open_food_facts"]).default("manual").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const mealTemplates = mysqlTable("meal_templates", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  mealName: varchar("mealName", { length: 191 }).notNull(),
  mealType: mysqlEnum("mealType", ["breakfast", "lunch", "dinner", "snack", "other"]).default("other").notNull(),
  foods: json("foods").notNull(), // Array of { foodId, quantity, unit }
  totalCalories: int("totalCalories").notNull(),
  totalProteinGrams: double("totalProteinGrams").notNull(),
  totalCarbsGrams: double("totalCarbsGrams").notNull(),
  totalFatGrams: double("totalFatGrams").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type HealthSource = typeof healthSources.$inferSelect;
export type InsertHealthSource = typeof healthSources.$inferInsert;
export type GlucoseReading = typeof glucoseReadings.$inferSelect;
export type ActivitySample = typeof activitySamples.$inferSelect;
export type NutritionLog = typeof nutritionLogs.$inferSelect;
export type SleepSession = typeof sleepSessions.$inferSelect;
export type AiInsight = typeof aiInsights.$inferSelect;
export type ChatThread = typeof chatThreads.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type WeeklySummary = typeof weeklySummaries.$inferSelect;
export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = typeof userProfiles.$inferInsert;
export type NutritionPlan = typeof nutritionPlans.$inferSelect;
export type InsertNutritionPlan = typeof nutritionPlans.$inferInsert;
export type FoodLog = typeof foodLogs.$inferSelect;
export type InsertFoodLog = typeof foodLogs.$inferInsert;
export type FavoriteFood = typeof favoriteFoods.$inferSelect;
export type InsertFavoriteFood = typeof favoriteFoods.$inferInsert;
export type MealTemplate = typeof mealTemplates.$inferSelect;
export type InsertMealTemplate = typeof mealTemplates.$inferInsert;

export const foodSearchCache = mysqlTable("food_search_cache", {
  id: int("id").autoincrement().primaryKey(),
  searchQuery: varchar("searchQuery", { length: 191 }).notNull(),
  foodName: varchar("foodName", { length: 191 }).notNull(),
  description: text("description"),
  calories: int("calories").notNull(),
  proteinGrams: double("proteinGrams").notNull(),
  carbsGrams: double("carbsGrams").notNull(),
  fatGrams: double("fatGrams").notNull(),
  servingSize: varchar("servingSize", { length: 120 }).default("100g").notNull(),
  source: mysqlEnum("source", ["gemini", "usda", "open_food_facts"]).default("gemini").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
});

export type FoodSearchCache = typeof foodSearchCache.$inferSelect;
export type InsertFoodSearchCache = typeof foodSearchCache.$inferInsert;

export const progressPhotos = mysqlTable("progress_photos", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  photoUrl: text("photoUrl").notNull(),
  photoKey: varchar("photoKey", { length: 255 }).notNull(), // S3 key for storage reference
  photoName: varchar("photoName", { length: 191 }).notNull(),
  photoDate: bigint("photoDate", { mode: "number" }).notNull(), // Unix timestamp
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProgressPhoto = typeof progressPhotos.$inferSelect;
export type InsertProgressPhoto = typeof progressPhotos.$inferInsert;
