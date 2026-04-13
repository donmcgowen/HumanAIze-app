CREATE TABLE `body_measurements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`chestInches` double,
	`waistInches` double,
	`hipsInches` double,
	`recordedAt` bigint NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `body_measurements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `body_measurements` ADD CONSTRAINT `body_measurements_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;