with open('drizzle/schema.ts', 'r') as f:
    content = f.read()

# Add goal fields to userProfiles table
old_profile = '''export const userProfiles = mysqlTable("user_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id).unique(),
  heightCm: double("heightCm"),
  weightKg: double("weightKg"),
  ageYears: int("ageYears"),
  fitnessGoal: mysqlEnum("fitnessGoal", ["lose_fat", "build_muscle", "maintain"]),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});'''

new_profile = '''export const userProfiles = mysqlTable("user_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id).unique(),
  heightCm: double("heightCm"),
  weightKg: double("weightKg"),
  ageYears: int("ageYears"),
  fitnessGoal: mysqlEnum("fitnessGoal", ["lose_fat", "build_muscle", "maintain"]),
  goalWeightKg: double("goalWeightKg"),
  goalDate: bigint("goalDate", { mode: "number" }),
  dailyCalorieTarget: int("dailyCalorieTarget"),
  dailyProteinTarget: int("dailyProteinTarget"),
  dailyCarbsTarget: int("dailyCarbsTarget"),
  dailyFatTarget: int("dailyFatTarget"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});'''

content = content.replace(old_profile, new_profile)

with open('drizzle/schema.ts', 'w') as f:
    f.write(content)

print("✓ Added goal fields to userProfiles table")
