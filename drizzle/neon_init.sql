-- HumanAIze Neon PostgreSQL Schema
-- Run once to initialize all tables

-- Enums
DO $$ BEGIN
  CREATE TYPE meal_type AS ENUM ('breakfast', 'lunch', 'dinner', 'snack');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE food_source AS ENUM ('gemini', 'usda', 'open_food_facts', 'branded', 'usda_generic');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Users
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(191) NOT NULL UNIQUE,
  "passwordHash" VARCHAR(255) NOT NULL,
  name VARCHAR(191),
  "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL,
  "updatedAt" TIMESTAMP DEFAULT NOW() NOT NULL
);

-- User Profiles
CREATE TABLE IF NOT EXISTS user_profiles (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "heightInches" DOUBLE PRECISION,
  "weightLbs" DOUBLE PRECISION,
  "goalWeightLbs" DOUBLE PRECISION,
  age INTEGER,
  gender VARCHAR(32),
  "activityLevel" VARCHAR(64),
  "fitnessGoal" VARCHAR(128),
  "goalDate" BIGINT,
  "dailyCalorieTarget" INTEGER,
  "dailyProteinTarget" INTEGER,
  "dailyCarbsTarget" INTEGER,
  "dailyFatTarget" INTEGER,
  "profilePhotoUrl" TEXT,
  "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL,
  "updatedAt" TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Food Logs
CREATE TABLE IF NOT EXISTS food_logs (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "mealType" meal_type NOT NULL,
  "foodName" VARCHAR(255) NOT NULL,
  "servingSize" VARCHAR(120) NOT NULL DEFAULT '100g',
  calories INTEGER NOT NULL,
  "proteinGrams" DOUBLE PRECISION NOT NULL,
  "carbsGrams" DOUBLE PRECISION NOT NULL,
  "fatGrams" DOUBLE PRECISION NOT NULL,
  "logDate" VARCHAR(10) NOT NULL,
  "loggedAt" BIGINT NOT NULL,
  "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_food_logs_user_date ON food_logs("userId", "logDate");

-- Health Sources
CREATE TABLE IF NOT EXISTS health_sources (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "sourceType" VARCHAR(64) NOT NULL,
  "sourceName" VARCHAR(191) NOT NULL,
  data TEXT,
  "recordedAt" BIGINT NOT NULL,
  "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Favorite Foods
CREATE TABLE IF NOT EXISTS favorite_foods (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "foodName" VARCHAR(255) NOT NULL,
  "servingSize" VARCHAR(120) NOT NULL DEFAULT '100g',
  calories INTEGER NOT NULL,
  "proteinGrams" DOUBLE PRECISION NOT NULL,
  "carbsGrams" DOUBLE PRECISION NOT NULL,
  "fatGrams" DOUBLE PRECISION NOT NULL,
  description TEXT,
  "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Meal Templates
CREATE TABLE IF NOT EXISTS meal_templates (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(191) NOT NULL,
  "mealType" meal_type NOT NULL,
  foods TEXT NOT NULL,
  "totalCalories" INTEGER NOT NULL,
  "totalProtein" DOUBLE PRECISION NOT NULL,
  "totalCarbs" DOUBLE PRECISION NOT NULL,
  "totalFat" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL,
  "updatedAt" TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Food Search Cache
CREATE TABLE IF NOT EXISTS food_search_cache (
  id SERIAL PRIMARY KEY,
  "searchQuery" VARCHAR(191) NOT NULL,
  "foodName" VARCHAR(191) NOT NULL,
  description TEXT,
  calories INTEGER NOT NULL,
  "proteinGrams" DOUBLE PRECISION NOT NULL,
  "carbsGrams" DOUBLE PRECISION NOT NULL,
  "fatGrams" DOUBLE PRECISION NOT NULL,
  "servingSize" VARCHAR(120) NOT NULL DEFAULT '100g',
  source food_source NOT NULL DEFAULT 'gemini',
  "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL,
  "expiresAt" TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_food_cache_query ON food_search_cache("searchQuery");

-- Progress Photos
CREATE TABLE IF NOT EXISTS progress_photos (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "photoUrl" TEXT NOT NULL,
  "photoKey" VARCHAR(255) NOT NULL,
  "photoName" VARCHAR(191) NOT NULL,
  "photoDate" BIGINT NOT NULL,
  description TEXT,
  "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL,
  "updatedAt" TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Weight Entries
CREATE TABLE IF NOT EXISTS weight_entries (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "weightLbs" INTEGER NOT NULL,
  "recordedAt" BIGINT NOT NULL,
  notes TEXT,
  "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Workout Entries
CREATE TABLE IF NOT EXISTS workout_entries (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "exerciseName" VARCHAR(191) NOT NULL,
  "exerciseType" VARCHAR(64) NOT NULL,
  "durationMinutes" INTEGER NOT NULL,
  "caloriesBurned" INTEGER NOT NULL DEFAULT 0,
  intensity VARCHAR(32) NOT NULL DEFAULT 'moderate',
  notes TEXT,
  sets INTEGER,
  reps INTEGER,
  "weightLbs" DOUBLE PRECISION,
  "recordedAt" BIGINT NOT NULL,
  "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workout_entries_user ON workout_entries("userId", "recordedAt");

-- Body Measurements
CREATE TABLE IF NOT EXISTS body_measurements (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "chestInches" DOUBLE PRECISION,
  "waistInches" DOUBLE PRECISION,
  "hipsInches" DOUBLE PRECISION,
  "recordedAt" BIGINT NOT NULL,
  notes TEXT,
  "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Glucose Readings
CREATE TABLE IF NOT EXISTS glucose_readings (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "glucoseMgDl" INTEGER NOT NULL,
  "readingType" VARCHAR(64) NOT NULL DEFAULT 'manual',
  "recordedAt" BIGINT NOT NULL,
  notes TEXT,
  "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Activity Samples
CREATE TABLE IF NOT EXISTS activity_samples (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  steps INTEGER NOT NULL DEFAULT 0,
  "activeCalories" INTEGER NOT NULL DEFAULT 0,
  "distanceMiles" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "recordedAt" BIGINT NOT NULL,
  "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Grocery Items
CREATE TABLE IF NOT EXISTS grocery_items (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(191) NOT NULL,
  category VARCHAR(64) NOT NULL DEFAULT 'other',
  "caloriesPer100g" DOUBLE PRECISION DEFAULT 0,
  "proteinPer100g" DOUBLE PRECISION DEFAULT 0,
  "carbsPer100g" DOUBLE PRECISION DEFAULT 0,
  "fatPer100g" DOUBLE PRECISION DEFAULT 0,
  "suggestedQty" VARCHAR(64),
  notes VARCHAR(255),
  "isChecked" BOOLEAN NOT NULL DEFAULT FALSE,
  "isAiSuggested" BOOLEAN NOT NULL DEFAULT TRUE,
  "addedAt" TIMESTAMP DEFAULT NOW() NOT NULL,
  "updatedAt" TIMESTAMP DEFAULT NOW() NOT NULL
);
