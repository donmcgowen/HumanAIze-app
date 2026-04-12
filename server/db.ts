import { and, eq, gte, lte, lt, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, userProfiles, InsertUserProfile, UserProfile, foodLogs, InsertFoodLog, FoodLog, healthSources, favoriteFoods, InsertFavoriteFood, FavoriteFood, mealTemplates, InsertMealTemplate, MealTemplate, foodSearchCache, InsertFoodSearchCache, FoodSearchCache, progressPhotos, InsertProgressPhoto, ProgressPhoto } from "../drizzle/schema";
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

    await db
      .insert(users)
      .values(values)
      .onDuplicateKeyUpdate({
        set: updateSet,
      });
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
  if (!profile || !profile.goalWeightKg || !profile.goalDate || !profile.weightKg) {
    return null;
  }

  const currentWeight = profile.weightKg;
  const goalWeight = profile.goalWeightKg;
  const now = new Date();
  
  // Handle goalDate which is stored as a number (timestamp in milliseconds)
  const goalDate = new Date(profile.goalDate);
  
  // Get weight history from food logs (assuming we track weight changes)
  // For now, we'll calculate based on profile creation date
  const startWeight = currentWeight; // This would ideally come from historical data
  
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
  if (!profile || !profile.weightKg) {
    return [];
  }

  // For now, return a simple array with just the current weight
  // In a real app, you'd track weight measurements over time
  const now = new Date();
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  return [
    {
      date: startDate.toISOString().split('T')[0],
      weight: profile.weightKg,
    },
    {
      date: now.toISOString().split('T')[0],
      weight: profile.weightKg,
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

  return db.select().from(progressPhotos).where(eq(progressPhotos.userId, userId)).orderBy((t) => desc(t.photoDate));
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
