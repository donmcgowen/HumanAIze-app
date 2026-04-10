import { eq, and, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, userProfiles, InsertUserProfile, UserProfile, foodLogs, InsertFoodLog, FoodLog } from "../drizzle/schema";
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

  await db.insert(foodLogs).values(newFood);
  
  const created = await db.select().from(foodLogs).where(eq(foodLogs.userId, userId)).orderBy((t) => t.createdAt).limit(1);
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
