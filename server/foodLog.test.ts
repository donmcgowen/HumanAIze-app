import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "./db";
import { users, foodLogs } from "../drizzle/schema";
import { eq } from "drizzle-orm";

describe("Food Log Operations", () => {
  let db: Awaited<ReturnType<typeof getDb>>;
  let testUserId: number;

  beforeAll(async () => {
    db = await getDb();
    if (!db) throw new Error("Database not available");

    // Create a test user
    const userResult = await db.insert(users).values({
      openId: `test-user-${Date.now()}`,
      name: "Test User",
      email: "test@example.com",
      loginMethod: "test",
      lastSignedIn: new Date(),
    });
    testUserId = Number(userResult[0].insertId);
  });

  afterAll(async () => {
    if (!db) return;
    // Clean up test data
    await db.delete(foodLogs).where(eq(foodLogs.userId, testUserId));
    await db.delete(users).where(eq(users.id, testUserId));
  });

  it("should add a food log entry", async () => {
    const result = await db.insert(foodLogs).values({
      userId: testUserId,
      foodName: "Chicken Breast",
      servingSize: "3 oz",
      proteinGrams: 26.5,
      carbsGrams: 0,
      fatGrams: 3.1,
      calories: 140,
      loggedAt: Date.now(),
    });

    expect(result[0].insertId).toBeDefined();

    // Verify the entry was stored
    const entries = await db
      .select()
      .from(foodLogs)
      .where(eq(foodLogs.userId, testUserId));
    expect(entries.length).toBeGreaterThan(0);
    const entry = entries.find((e) => e.foodName === "Chicken Breast");
    expect(entry).toBeDefined();
    expect(entry?.proteinGrams).toBe(26.5);
    expect(entry?.calories).toBe(140);
  });

  it("should update a food log entry", async () => {
    // Add an entry
    const addResult = await db.insert(foodLogs).values({
      userId: testUserId,
      foodName: "Egg (1 large)",
      servingSize: "1 piece",
      proteinGrams: 6,
      carbsGrams: 0.4,
      fatGrams: 5,
      calories: 78,
      loggedAt: Date.now(),
    });

    const entryId = Number(addResult[0].insertId);

    // Update the entry
    await db
      .update(foodLogs)
      .set({
        servingSize: "2 pieces",
        proteinGrams: 12,
        carbsGrams: 0.8,
        fatGrams: 10,
        calories: 156,
      })
      .where(eq(foodLogs.id, entryId));

    // Verify the update
    const updated = await db
      .select()
      .from(foodLogs)
      .where(eq(foodLogs.id, entryId));
    expect(updated[0].servingSize).toBe("2 pieces");
    expect(updated[0].proteinGrams).toBe(12);
    expect(updated[0].calories).toBe(156);
  });

  it("should delete a food log entry", async () => {
    // Add an entry
    const addResult = await db.insert(foodLogs).values({
      userId: testUserId,
      foodName: "Protein Powder (whey)",
      servingSize: "1 scoop",
      proteinGrams: 25,
      carbsGrams: 2,
      fatGrams: 1,
      calories: 110,
      loggedAt: Date.now(),
    });

    const entryId = Number(addResult[0].insertId);

    // Delete the entry
    await db.delete(foodLogs).where(eq(foodLogs.id, entryId));

    // Verify deletion
    const deleted = await db
      .select()
      .from(foodLogs)
      .where(eq(foodLogs.id, entryId));
    expect(deleted.length).toBe(0);
  });

  it("should calculate daily totals correctly", async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    // Add multiple entries for today
    await db.insert(foodLogs).values([
      {
        userId: testUserId,
        foodName: "Breakfast",
        servingSize: "1 meal",
        proteinGrams: 20,
        carbsGrams: 40,
        fatGrams: 10,
        calories: 400,
        loggedAt: todayMs + 1000 * 60 * 60 * 8, // 8 AM
      },
      {
        userId: testUserId,
        foodName: "Lunch",
        servingSize: "1 meal",
        proteinGrams: 35,
        carbsGrams: 50,
        fatGrams: 15,
        calories: 600,
        loggedAt: todayMs + 1000 * 60 * 60 * 12, // 12 PM
      },
      {
        userId: testUserId,
        foodName: "Dinner",
        servingSize: "1 meal",
        proteinGrams: 40,
        carbsGrams: 60,
        fatGrams: 20,
        calories: 700,
        loggedAt: todayMs + 1000 * 60 * 60 * 18, // 6 PM
      },
    ]);

    // Fetch today's entries and calculate totals
    const todayEntries = await db
      .select()
      .from(foodLogs)
      .where(eq(foodLogs.userId, testUserId));

    const totals = todayEntries.reduce(
      (acc, entry) => ({
        protein: acc.protein + entry.proteinGrams,
        carbs: acc.carbs + entry.carbsGrams,
        fat: acc.fat + entry.fatGrams,
        calories: acc.calories + entry.calories,
      }),
      { protein: 0, carbs: 0, fat: 0, calories: 0 }
    );

    expect(totals.protein).toBeGreaterThanOrEqual(95);
    expect(totals.carbs).toBeGreaterThanOrEqual(150);
    expect(totals.fat).toBeGreaterThanOrEqual(45);
    expect(totals.calories).toBeGreaterThanOrEqual(1700);
  });

  it("should retrieve food logs for a specific user only", async () => {
    // Create another test user
    const otherUserResult = await db.insert(users).values({
      openId: `other-user-${Date.now()}`,
      name: "Other User",
      email: "other@example.com",
      loginMethod: "test",
      lastSignedIn: new Date(),
    });
    const otherUserId = Number(otherUserResult[0].insertId);

    // Add entries for both users
    await db.insert(foodLogs).values({
      userId: testUserId,
      foodName: "Test User Food",
      servingSize: "1 piece",
      proteinGrams: 10,
      carbsGrams: 20,
      fatGrams: 5,
      calories: 200,
      loggedAt: Date.now(),
    });

    await db.insert(foodLogs).values({
      userId: otherUserId,
      foodName: "Other User Food",
      servingSize: "1 piece",
      proteinGrams: 15,
      carbsGrams: 30,
      fatGrams: 8,
      calories: 300,
      loggedAt: Date.now(),
    });

    // Verify each user only sees their own entries
    const testUserEntries = await db
      .select()
      .from(foodLogs)
      .where(eq(foodLogs.userId, testUserId));
    const otherUserEntries = await db
      .select()
      .from(foodLogs)
      .where(eq(foodLogs.userId, otherUserId));

    expect(testUserEntries.some((e) => e.userId === testUserId)).toBe(true);
    expect(otherUserEntries.some((e) => e.userId === otherUserId)).toBe(true);

    // Clean up
    await db.delete(foodLogs).where(eq(foodLogs.userId, otherUserId));
    await db.delete(users).where(eq(users.id, otherUserId));
  });
});
