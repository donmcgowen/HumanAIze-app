CREATE TABLE `progress_photos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`photoUrl` text NOT NULL,
	`photoKey` varchar(255) NOT NULL,
	`photoName` varchar(191) NOT NULL,
	`photoDate` bigint NOT NULL,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `progress_photos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `progress_photos` ADD CONSTRAINT `progress_photos_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;