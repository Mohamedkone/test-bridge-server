CREATE TABLE `activities` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`file_id` varchar(36),
	`room_id` varchar(36),
	`action` enum('upload','download','share','delete','restore','move','rename','create_folder','join_room','leave_room','update_permissions') NOT NULL,
	`metadata` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `shares` (
	`id` varchar(36) NOT NULL,
	`file_id` varchar(36) NOT NULL,
	`created_by_id` varchar(36) NOT NULL,
	`access_level` enum('read','write') NOT NULL,
	`expires_at` timestamp,
	`max_downloads` int,
	`password` varchar(255),
	`is_public` boolean NOT NULL DEFAULT false,
	`download_count` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `shares_id` PRIMARY KEY(`id`)
);
