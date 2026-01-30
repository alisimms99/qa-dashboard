CREATE TABLE `analyses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`callId` varchar(128) NOT NULL,
	`score` int NOT NULL,
	`summary` text NOT NULL,
	`complianceCheck` enum('Pass','Fail','Review') NOT NULL,
	`complianceNotes` text,
	`hasGreeting` boolean,
	`hasClosing` boolean,
	`concernsAddressed` boolean,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `analyses_id` PRIMARY KEY(`id`),
	CONSTRAINT `analyses_callId_unique` UNIQUE(`callId`)
);
--> statement-breakpoint
CREATE TABLE `calls` (
	`id` int AUTO_INCREMENT NOT NULL,
	`callId` varchar(128) NOT NULL,
	`direction` enum('incoming','outgoing') NOT NULL,
	`fromNumber` varchar(32) NOT NULL,
	`toNumber` varchar(32) NOT NULL,
	`duration` int NOT NULL DEFAULT 0,
	`status` varchar(32) NOT NULL,
	`createdAt` timestamp NOT NULL,
	`answeredAt` timestamp,
	`completedAt` timestamp,
	`phoneNumberId` varchar(128),
	`userId` varchar(128),
	`metadata` json,
	CONSTRAINT `calls_id` PRIMARY KEY(`id`),
	CONSTRAINT `calls_callId_unique` UNIQUE(`callId`)
);
--> statement-breakpoint
CREATE TABLE `transcripts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`callId` varchar(128) NOT NULL,
	`fullText` text NOT NULL,
	`jsonPayload` json NOT NULL,
	`duration` int,
	`status` varchar(32) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `transcripts_id` PRIMARY KEY(`id`),
	CONSTRAINT `transcripts_callId_unique` UNIQUE(`callId`)
);
