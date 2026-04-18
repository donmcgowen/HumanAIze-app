-- Migration: Add workout_entries table, activityLevel and diabetesType columns
-- workout_entries table
CREATE TABLE IF NOT EXISTS `workout_entries` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `exerciseName` varchar(191) NOT NULL,
  `exerciseType` varchar(64) NOT NULL,
  `durationMinutes` int NOT NULL,
  `caloriesBurned` int NOT NULL DEFAULT 0,
  `intensity` varchar(32) NOT NULL DEFAULT 'moderate',
  `notes` text,
  `recordedAt` bigint NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `workout_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `workout_entries` ADD CONSTRAINT `workout_entries_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- Add activityLevel column to user_profiles
ALTER TABLE `user_profiles` ADD COLUMN IF NOT EXISTS `activityLevel` enum('sedentary','lightly_active','moderately_active','very_active','extremely_active') DEFAULT 'moderately_active';
--> statement-breakpoint

-- Add diabetesType column to user_profiles
ALTER TABLE `user_profiles` ADD COLUMN IF NOT EXISTS `diabetesType` enum('type1','type2','prediabetes','gestational','other') DEFAULT NULL;
--> statement-breakpoint

-- Add sugarGrams column to food_logs
ALTER TABLE `food_logs` ADD COLUMN IF NOT EXISTS `sugarGrams` double DEFAULT 0;
