CREATE TABLE `activity_samples` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`sourceId` int NOT NULL,
	`sampleDate` bigint NOT NULL,
	`steps` int NOT NULL DEFAULT 0,
	`activeMinutes` int NOT NULL DEFAULT 0,
	`caloriesBurned` int NOT NULL DEFAULT 0,
	`workoutMinutes` int NOT NULL DEFAULT 0,
	`distanceKm` double NOT NULL DEFAULT 0,
	`sourceLabel` varchar(120),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activity_samples_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ai_insights` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(191) NOT NULL,
	`summary` text NOT NULL,
	`severity` enum('info','watch','priority') NOT NULL DEFAULT 'info',
	`evidence` json,
	`recommendation` text NOT NULL,
	`generatedAt` bigint NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ai_insights_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`threadId` int NOT NULL,
	`role` enum('user','assistant','system') NOT NULL,
	`content` text NOT NULL,
	`citedMetricWindow` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chat_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chat_threads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(191) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `chat_threads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `glucose_readings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`sourceId` int NOT NULL,
	`readingAt` bigint NOT NULL,
	`mgdl` double NOT NULL,
	`trend` varchar(64),
	`mealContext` varchar(120),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `glucose_readings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `health_sources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`provider` enum('dexcom','glooko','fitbit','google_fit','apple_health','myfitnesspal','cronometer','oura') NOT NULL,
	`category` enum('glucose','activity','nutrition','sleep','multi') NOT NULL,
	`status` enum('ready','connected','syncing','attention','planned') NOT NULL DEFAULT 'ready',
	`implementationStage` enum('direct_oauth','partner_required','native_bridge','legacy','planned') NOT NULL,
	`authType` enum('oauth2','partner','native_bridge','manual','legacy') NOT NULL,
	`displayName` varchar(120) NOT NULL,
	`description` text NOT NULL,
	`accessToken` text,
	`refreshToken` text,
	`externalUserId` varchar(191),
	`tokenExpiresAt` bigint,
	`lastSyncAt` bigint,
	`lastSyncStatus` enum('idle','success','error','pending') NOT NULL DEFAULT 'idle',
	`lastError` text,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `health_sources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `insight_preferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`weeklyEmailEnabled` boolean NOT NULL DEFAULT true,
	`summaryDayOfWeek` int NOT NULL DEFAULT 1,
	`summaryHourUtc` int NOT NULL DEFAULT 13,
	`timezone` varchar(64) NOT NULL DEFAULT 'UTC',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `insight_preferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `insight_preferences_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `nutrition_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`sourceId` int NOT NULL,
	`loggedAt` bigint NOT NULL,
	`mealName` varchar(191) NOT NULL,
	`calories` int NOT NULL DEFAULT 0,
	`carbs` double NOT NULL DEFAULT 0,
	`protein` double NOT NULL DEFAULT 0,
	`fat` double NOT NULL DEFAULT 0,
	`fiber` double NOT NULL DEFAULT 0,
	`sugar` double NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `nutrition_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sleep_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`sourceId` int NOT NULL,
	`sleepStartAt` bigint NOT NULL,
	`sleepEndAt` bigint NOT NULL,
	`durationMinutes` int NOT NULL,
	`efficiency` double NOT NULL DEFAULT 0,
	`score` int NOT NULL DEFAULT 0,
	`restingHeartRate` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sleep_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sync_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`sourceId` int NOT NULL,
	`syncType` enum('initial','manual','scheduled','backfill') NOT NULL DEFAULT 'manual',
	`status` enum('queued','running','success','error') NOT NULL DEFAULT 'queued',
	`startedAt` bigint NOT NULL,
	`finishedAt` bigint,
	`recordCount` int NOT NULL DEFAULT 0,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sync_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `weekly_summaries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`weekStartAt` bigint NOT NULL,
	`weekEndAt` bigint NOT NULL,
	`subject` varchar(191) NOT NULL,
	`summaryMarkdown` text NOT NULL,
	`deliveryStatus` enum('scheduled','generated','queued','needs_email_provider','sent','error') NOT NULL DEFAULT 'needs_email_provider',
	`deliveredAt` bigint,
	`generationContext` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `weekly_summaries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `activity_samples` ADD CONSTRAINT `activity_samples_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `activity_samples` ADD CONSTRAINT `activity_samples_sourceId_health_sources_id_fk` FOREIGN KEY (`sourceId`) REFERENCES `health_sources`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ai_insights` ADD CONSTRAINT `ai_insights_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD CONSTRAINT `chat_messages_threadId_chat_threads_id_fk` FOREIGN KEY (`threadId`) REFERENCES `chat_threads`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chat_threads` ADD CONSTRAINT `chat_threads_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `glucose_readings` ADD CONSTRAINT `glucose_readings_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `glucose_readings` ADD CONSTRAINT `glucose_readings_sourceId_health_sources_id_fk` FOREIGN KEY (`sourceId`) REFERENCES `health_sources`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `health_sources` ADD CONSTRAINT `health_sources_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `insight_preferences` ADD CONSTRAINT `insight_preferences_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `nutrition_logs` ADD CONSTRAINT `nutrition_logs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `nutrition_logs` ADD CONSTRAINT `nutrition_logs_sourceId_health_sources_id_fk` FOREIGN KEY (`sourceId`) REFERENCES `health_sources`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sleep_sessions` ADD CONSTRAINT `sleep_sessions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sleep_sessions` ADD CONSTRAINT `sleep_sessions_sourceId_health_sources_id_fk` FOREIGN KEY (`sourceId`) REFERENCES `health_sources`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sync_jobs` ADD CONSTRAINT `sync_jobs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sync_jobs` ADD CONSTRAINT `sync_jobs_sourceId_health_sources_id_fk` FOREIGN KEY (`sourceId`) REFERENCES `health_sources`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `weekly_summaries` ADD CONSTRAINT `weekly_summaries_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;