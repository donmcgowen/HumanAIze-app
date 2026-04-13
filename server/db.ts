import { and, eq, gte, lte, lt, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, userProfiles, InsertUserProfile, UserProfile, foodLogs, InsertFoodLog, FoodLog, healthSources, favoriteFoods, InsertFavoriteFood, FavoriteFood, mealTemplates, InsertMealTemplate, MealTemplate, foodSearchCache, InsertFoodSearchCache, FoodSearchCache, progressPhotos, InsertProgressPhoto, ProgressPhoto, glucoseReadings, GlucoseReading, activitySamples, weightEntries, InsertWeightEntry, WeightEntry } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }

  return _db;
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
    console.warn("[Database] Cannot get profile: database not available");
    return null;
  }

  try {
    const result = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.warn("[Database] Error getting user profile:", error);
    return null;
  }
}

export async function upsertUserProfile(userId: number, updates: Partial<InsertUserProfile>): Promise<UserProfile> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database is not available");
  }

  // Filter out undefined values and activityLevel (not yet in DB)
  const filteredUpdates = Object.fromEntries(
    Object.entries(updates)
      .filter(([key, value]) => value !== undefined && key !== "activityLevel")
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
    throw new Error("Database is not available");
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
    console.warn("[Database] Cannot get food logs: database not available");
    return [];
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
    throw new Error("Database is not available");
  }

  await db.delete(foodLogs).where(and(eq(foodLogs.id, foodLogId), eq(foodLogs.userId, userId)));
  return true;
}

export async function updateFoodLog(foodLogId: number, userId: number, updates: Partial<Omit<InsertFoodLog, "userId">>): Promise<FoodLog> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database is not available");
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
    throw new Error("Database is not available");
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
    console.warn("[Database] Cannot get progress photos: database not available");
    return [];
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
    throw new Error("Database is not available");
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
    throw new Error("Database is not available");
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

export async function addGlucoseReadings(userId: number, sourceId: number, readings: Array<{ readingAt: number; mgdl: number; trend?: string }>) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database is not available");
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
    console.warn("[Database] Cannot get glucose readings: database not available");
    return [];
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


// Weight Tracking Functions
export async function addWeightEntry(userId: number, weightLbs: number, recordedAt: number, notes?: string): Promise<WeightEntry> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database is not available");
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
    console.warn("[Database] Cannot get weight entries: database not available");
    return [];
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
    throw new Error("Database is not available");
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
  if (!db) return null;

  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const readings = await db
    .select()
    .from(glucoseReadings)
    .where(and(eq(glucoseReadings.userId, userId), gte(glucoseReadings.readingAt, since)))
    .orderBy(desc(glucoseReadings.readingAt));

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
  if (!db) return [];

  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const readings = await db
    .select()
    .from(glucoseReadings)
    .where(and(eq(glucoseReadings.userId, userId), gte(glucoseReadings.readingAt, since)))
    .orderBy(glucoseReadings.readingAt);

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
