CREATE TABLE IF NOT EXISTS `progress_photos` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL,
  `photoUrl` text NOT NULL,
  `photoKey` varchar(255) NOT NULL,
  `photoName` varchar(191) NOT NULL,
  `photoDate` bigint NOT NULL,
  `description` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
