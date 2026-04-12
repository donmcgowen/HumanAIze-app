-- Add missing columns to user_profiles table
ALTER TABLE `user_profiles` 
ADD COLUMN `goalWeightKg` DOUBLE NULL AFTER `fitnessGoal`,
ADD COLUMN `goalDate` BIGINT NULL AFTER `goalWeightKg`,
ADD COLUMN `dailyCalorieTarget` INT NULL AFTER `goalDate`,
ADD COLUMN `dailyProteinTarget` INT NULL AFTER `dailyCalorieTarget`,
ADD COLUMN `dailyCarbsTarget` INT NULL AFTER `dailyProteinTarget`,
ADD COLUMN `dailyFatTarget` INT NULL AFTER `dailyCarbsTarget`;
