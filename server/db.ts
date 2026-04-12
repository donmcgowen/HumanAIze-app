import { eq, and, gte, lte, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, userProfiles, InsertUserProfile, UserProfile, foodLogs, InsertFoodLog, FoodLog, healthSources, favoriteFoods, InsertFavoriteFood, FavoriteFood, mealTemplates, InsertMealTemplate, MealTemplate } from "../drizzle/schema";
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

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }

    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
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

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user by id: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserProfile(userId: number): Promise<UserProfile | undefined> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user profile: database not available");
    return undefined;
  }

  const result = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function upsertUserProfile(userId: number, profile: Partial<InsertUserProfile>): Promise<UserProfile> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database is not available");
  }

  const existing = await getUserProfile(userId);
  
  if (existing) {
    // Update existing profile
    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };
    
    if (profile.heightCm !== undefined) updateData.heightCm = profile.heightCm;
    if (profile.weightKg !== undefined) updateData.weightKg = profile.weightKg;
    if (profile.ageYears !== undefined) updateData.ageYears = profile.ageYears;
    if (profile.fitnessGoal !== undefined) updateData.fitnessGoal = profile.fitnessGoal;
    if (profile.activityLevel !== undefined) updateData.activityLevel = profile.activityLevel;
    if (profile.goalWeightKg !== undefined) updateData.goalWeightKg = profile.goalWeightKg;
    if (profile.goalDate !== undefined) updateData.goalDate = profile.goalDate;
    if (profile.dailyCalorieTarget !== undefined) updateData.dailyCalorieTarget = profile.dailyCalorieTarget;
    if (profile.dailyProteinTarget !== undefined) updateData.dailyProteinTarget = profile.dailyProteinTarget;
    if (profile.dailyCarbsTarget !== undefined) updateData.dailyCarbsTarget = profile.dailyCarbsTarget;
    if (profile.dailyFatTarget !== undefined) updateData.dailyFatTarget = profile.dailyFatTarget;
    
    await db.update(userProfiles).set(updateData).where(eq(userProfiles.userId, userId));
    
    const updated = await getUserProfile(userId);
    if (!updated) throw new Error("Failed to update user profile");
    return updated;
  } else {
    // Create new profile
    const newProfile: InsertUserProfile = {
      userId,
      heightCm: profile.heightCm,
      weightKg: profile.weightKg,
      ageYears: profile.ageYears,
      fitnessGoal: profile.fitnessGoal,
      activityLevel: profile.activityLevel,
      goalWeightKg: profile.goalWeightKg,
      goalDate: profile.goalDate,
      dailyCalorieTarget: profile.dailyCalorieTarget,
      dailyProteinTarget: profile.dailyProteinTarget,
      dailyCarbsTarget: profile.dailyCarbsTarget,
      dailyFatTarget: profile.dailyFatTarget,
    };
    
    await db.insert(userProfiles).values(newProfile);
    
    const created = await getUserProfile(userId);
    if (!created) throw new Error("Failed to create user profile");
    return created;
  }
}



export async function addFoodLog(userId: number, food: Omit<InsertFoodLog, 'userId'>): Promise<FoodLog> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database is not available");
  }

  const newFood: InsertFoodLog = {
    userId,
    foodName: food.foodName,
    servingSize: food.servingSize,
    calories: food.calories,
    proteinGrams: food.proteinGrams,
    carbsGrams: food.carbsGrams,
    fatGrams: food.fatGrams,
    loggedAt: food.loggedAt,
    mealType: food.mealType || "other",
    notes: food.notes,
  };

  const result = await db.insert(foodLogs).values(newFood);
  
  // Get the newly inserted row by ordering by createdAt descending (most recent first)
  const created = await db.select().from(foodLogs).where(eq(foodLogs.userId, userId)).orderBy((t) => desc(t.createdAt)).limit(1);
  if (!created || created.length === 0) throw new Error("Failed to create food log");
  return created[0];
}

export async function getFoodLogsForDay(userId: number, startOfDay: number, endOfDay: number): Promise<FoodLog[]> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get food logs: database not available");
    return [];
  }

  return db.select().from(foodLogs).where(
    and(
      eq(foodLogs.userId, userId),
      gte(foodLogs.loggedAt, startOfDay),
      lte(foodLogs.loggedAt, endOfDay)
    )
  );
}

export async function deleteFoodLog(foodLogId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database is not available");
  }

  await db.delete(foodLogs).where(and(eq(foodLogs.id, foodLogId), eq(foodLogs.userId, userId)));
  return true;
}

export async function updateFoodLog(
  foodLogId: number,
  userId: number,
  updates: Partial<Omit<InsertFoodLog, 'userId'>>
): Promise<FoodLog> {
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


export async function cleanupUnwantedSources(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database is not available");
  }

  // Delete all pre-configured sources except custom_app
  // This removes Dexcom (provider), Fitbit, Oura, Apple Health, Google Fit, etc.
  const providersToDelete = ["dexcom", "fitbit", "oura", "apple_health", "google_fit", "whoop"] as const;
  
  for (const provider of providersToDelete) {
    await db.delete(healthSources).where(
      and(
        eq(healthSources.userId, userId),
        eq(healthSources.provider, provider as any)
      )
    );
  }
}


// Favorite Foods Functions
export async function addFavoriteFood(userId: number, food: Omit<InsertFavoriteFood, 'userId'>): Promise<FavoriteFood> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database is not available");
  }

  const newFood: InsertFavoriteFood = {
    userId,
    foodName: food.foodName,
    servingSize: food.servingSize,
    calories: food.calories,
    proteinGrams: food.proteinGrams,
    carbsGrams: food.carbsGrams,
    fatGrams: food.fatGrams,
    source: food.source || "manual",
  };

  const result = await db.insert(favoriteFoods).values(newFood);
  
  const created = await db.select().from(favoriteFoods).where(eq(favoriteFoods.userId, userId)).orderBy((t) => desc(t.createdAt)).limit(1);
  if (!created || created.length === 0) throw new Error("Failed to add favorite food");
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
