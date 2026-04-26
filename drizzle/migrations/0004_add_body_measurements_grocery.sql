-- Create body_measurements table
CREATE TABLE IF NOT EXISTS `body_measurements` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `chestInches` double,
  `waistInches` double,
  `hipsInches` double,
  `recordedAt` bigint NOT NULL,
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `body_measurements_id` PRIMARY KEY (`id`),
  CONSTRAINT `body_measurements_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
) ENGINE=InnoDB;

CREATE INDEX IF NOT EXISTS `idx_body_measurements_userId_recordedAt` ON `body_measurements` (`userId`, `recordedAt` DESC);

-- Create grocery_items table
CREATE TABLE IF NOT EXISTS `grocery_items` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `name` varchar(191) NOT NULL,
  `category` varchar(64) NOT NULL DEFAULT 'other',
  `caloriesPer100g` double DEFAULT 0,
  `proteinPer100g` double DEFAULT 0,
  `carbsPer100g` double DEFAULT 0,
  `fatPer100g` double DEFAULT 0,
  `suggestedQty` varchar(64),
  `notes` varchar(255),
  `isChecked` tinyint NOT NULL DEFAULT 0,
  `isAiSuggested` tinyint NOT NULL DEFAULT 1,
  `addedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `grocery_items_id` PRIMARY KEY (`id`),
  CONSTRAINT `grocery_items_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
) ENGINE=InnoDB;
