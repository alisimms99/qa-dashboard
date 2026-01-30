ALTER TABLE `analyses` ADD `sentiment` enum('Positive','Neutral','Negative');--> statement-breakpoint
ALTER TABLE `analyses` ADD `actionItems` text;--> statement-breakpoint
ALTER TABLE `analyses` ADD `metadata` json;