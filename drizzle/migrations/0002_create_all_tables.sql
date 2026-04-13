-- Create favorite_foods table
CREATE TABLE IF NOT EXISTS `favorite_foods` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`foodName` varchar(191) NOT NULL,
	`servingSize` varchar(120) NOT NULL,
	`calories` int NOT NULL,
	`proteinGrams` double NOT NULL,
	`carbsGrams` double NOT NULL,
	`fatGrams` double NOT NULL,
	`source` enum('manual','ai_recognized','usda','open_food_facts') NOT NULL DEFAULT 'manual',
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `favorite_foods_id` PRIMARY KEY (`id`),
	CONSTRAINT `favorite_foods_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
) ENGINE=InnoDB;

-- Create meal_templates table
CREATE TABLE IF NOT EXISTS `meal_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`mealName` varchar(191) NOT NULL,
	`mealType` enum('breakfast','lunch','dinner','snack','other') NOT NULL DEFAULT 'other',
	`foods` json NOT NULL,
	`totalCalories` int NOT NULL,
	`totalProteinGrams` double NOT NULL,
	`totalCarbsGrams` double NOT NULL,
	`totalFatGrams` double NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `meal_templates_id` PRIMARY KEY (`id`),
	CONSTRAINT `meal_templates_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
) ENGINE=InnoDB;

-- Create food_search_cache table
CREATE TABLE IF NOT EXISTS `food_search_cache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`query` varchar(255) NOT NULL,
	`results` json NOT NULL,
	`source` enum('usda','open_food_facts','ai_recognized') NOT NULL DEFAULT 'usda',
	`resultCount` int NOT NULL,
	`searchedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`expiresAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `food_search_cache_id` PRIMARY KEY (`id`),
	CONSTRAINT `food_search_cache_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
) ENGINE=InnoDB;

-- Create nutrition_plans table
CREATE TABLE IF NOT EXISTS `nutrition_plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`planName` varchar(191) NOT NULL,
	`description` text,
	`dietType` enum('balanced','low_carb','high_protein','keto','vegan','paleo','mediterranean') NOT NULL DEFAULT 'balanced',
	`dailyCalorieTarget` int NOT NULL,
	`dailyProteinGrams` double NOT NULL,
	`dailyCarbsGrams` double NOT NULL,
	`dailyFatGrams` double NOT NULL,
	`macroRatioProtein` double NOT NULL,
	`macroRatioCarbs` double NOT NULL,
	`macroRatioFat` double NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `nutrition_plans_id` PRIMARY KEY (`id`),
	CONSTRAINT `nutrition_plans_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
) ENGINE=InnoDB;

-- Create nutrition_logs table
CREATE TABLE IF NOT EXISTS `nutrition_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`date` date NOT NULL,
	`totalCalories` int NOT NULL DEFAULT 0,
	`totalProteinGrams` double NOT NULL DEFAULT 0,
	`totalCarbsGrams` double NOT NULL DEFAULT 0,
	`totalFatGrams` double NOT NULL DEFAULT 0,
	`mealCount` int NOT NULL DEFAULT 0,
	`waterIntakeMl` int,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `nutrition_logs_id` PRIMARY KEY (`id`),
	CONSTRAINT `nutrition_logs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`),
	CONSTRAINT `nutrition_logs_date_userId_unique` UNIQUE (`date`, `userId`)
) ENGINE=InnoDB;

-- Create sleep_sessions table
CREATE TABLE IF NOT EXISTS `sleep_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`startTime` timestamp NOT NULL,
	`endTime` timestamp NOT NULL,
	`durationMinutes` int NOT NULL,
	`quality` enum('poor','fair','good','excellent') NOT NULL DEFAULT 'good',
	`deepSleepMinutes` int,
	`remSleepMinutes` int,
	`lightSleepMinutes` int,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `sleep_sessions_id` PRIMARY KEY (`id`),
	CONSTRAINT `sleep_sessions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
) ENGINE=InnoDB;

-- Create activity_samples table
CREATE TABLE IF NOT EXISTS `activity_samples` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`timestamp` timestamp NOT NULL,
	`activityType` enum('walking','running','cycling','swimming','gym','sports','other') NOT NULL DEFAULT 'other',
	`durationMinutes` int NOT NULL,
	`caloriesBurned` int,
	`heartRateAvg` int,
	`heartRateMax` int,
	`steps` int,
	`distance` double,
	`intensity` enum('light','moderate','vigorous') NOT NULL DEFAULT 'moderate',
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `activity_samples_id` PRIMARY KEY (`id`),
	CONSTRAINT `activity_samples_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
) ENGINE=InnoDB;

-- Create glucose_readings table
CREATE TABLE IF NOT EXISTS `glucose_readings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`timestamp` timestamp NOT NULL,
	`glucoseMgDl` int NOT NULL,
	`source` enum('dexcom','manual','other') NOT NULL DEFAULT 'manual',
	`mealContext` enum('fasting','pre_meal','post_meal','other') NOT NULL DEFAULT 'other',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `glucose_readings_id` PRIMARY KEY (`id`),
	CONSTRAINT `glucose_readings_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
) ENGINE=InnoDB;

-- Create health_sources table
CREATE TABLE IF NOT EXISTS `health_sources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`sourceType` enum('dexcom','apple_health','google_fit','fitbit','oura','garmin','manual','other') NOT NULL DEFAULT 'manual',
	`sourceName` varchar(191) NOT NULL,
	`isConnected` boolean NOT NULL DEFAULT false,
	`lastSyncedAt` timestamp,
	`accessToken` text,
	`refreshToken` text,
	`tokenExpiresAt` timestamp,
	`syncFrequency` enum('manual','hourly','daily','weekly') NOT NULL DEFAULT 'daily',
	`dataTypes` json NOT NULL,
	`settings` json,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `health_sources_id` PRIMARY KEY (`id`),
	CONSTRAINT `health_sources_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
) ENGINE=InnoDB;

-- Create sync_jobs table
CREATE TABLE IF NOT EXISTS `sync_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`sourceId` int NOT NULL,
	`status` enum('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
	`dataType` varchar(100) NOT NULL,
	`startTime` timestamp,
	`endTime` timestamp,
	`recordsProcessed` int NOT NULL DEFAULT 0,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `sync_jobs_id` PRIMARY KEY (`id`),
	CONSTRAINT `sync_jobs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`),
	CONSTRAINT `sync_jobs_sourceId_health_sources_id_fk` FOREIGN KEY (`sourceId`) REFERENCES `health_sources`(`id`)
) ENGINE=InnoDB;

-- Create chat_threads table
CREATE TABLE IF NOT EXISTS `chat_threads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`context` text,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `chat_threads_id` PRIMARY KEY (`id`),
	CONSTRAINT `chat_threads_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
) ENGINE=InnoDB;

-- Create chat_messages table
CREATE TABLE IF NOT EXISTS `chat_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`threadId` int NOT NULL,
	`role` enum('user','assistant','system') NOT NULL DEFAULT 'user',
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `chat_messages_id` PRIMARY KEY (`id`),
	CONSTRAINT `chat_messages_threadId_chat_threads_id_fk` FOREIGN KEY (`threadId`) REFERENCES `chat_threads`(`id`)
) ENGINE=InnoDB;

-- Create ai_insights table
CREATE TABLE IF NOT EXISTS `ai_insights` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`insightType` enum('nutrition','activity','sleep','glucose','general') NOT NULL DEFAULT 'general',
	`title` varchar(255) NOT NULL,
	`content` text NOT NULL,
	`actionItems` json,
	`confidence` double,
	`generatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`expiresAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `ai_insights_id` PRIMARY KEY (`id`),
	CONSTRAINT `ai_insights_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
) ENGINE=InnoDB;

-- Create insight_preferences table
CREATE TABLE IF NOT EXISTS `insight_preferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`insightType` enum('nutrition','activity','sleep','glucose','general') NOT NULL DEFAULT 'general',
	`isEnabled` boolean NOT NULL DEFAULT true,
	`frequency` enum('daily','weekly','monthly','on_demand') NOT NULL DEFAULT 'daily',
	`deliveryMethod` enum('in_app','email','sms','push') NOT NULL DEFAULT 'in_app',
	`preferences` json,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `insight_preferences_id` PRIMARY KEY (`id`),
	CONSTRAINT `insight_preferences_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
) ENGINE=InnoDB;

-- Create weekly_summaries table
CREATE TABLE IF NOT EXISTS `weekly_summaries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`weekStartDate` date NOT NULL,
	`weekEndDate` date NOT NULL,
	`summaryContent` json NOT NULL,
	`insights` json,
	`recommendations` json,
	`generatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `weekly_summaries_id` PRIMARY KEY (`id`),
	CONSTRAINT `weekly_summaries_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
) ENGINE=InnoDB;
