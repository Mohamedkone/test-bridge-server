CREATE TABLE `company_invites` (
	`id` varchar(128) NOT NULL,
	`company_id` varchar(128) NOT NULL,
	`email` varchar(255) NOT NULL,
	`role` varchar(50) NOT NULL DEFAULT 'member',
	`token` varchar(255) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`status` varchar(50) NOT NULL DEFAULT 'pending',
	`metadata` json DEFAULT ('{}'),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `company_invites_id` PRIMARY KEY(`id`),
	CONSTRAINT `company_invites_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `user_companies` (
	`id` varchar(128) NOT NULL,
	`user_id` varchar(128) NOT NULL,
	`company_id` varchar(128) NOT NULL,
	`role` varchar(50) NOT NULL DEFAULT 'member',
	`is_default` boolean NOT NULL DEFAULT false,
	`metadata` json DEFAULT ('{}'),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_companies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_sessions` (
	`id` varchar(128) NOT NULL,
	`user_id` varchar(128) NOT NULL,
	`token` varchar(255) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`metadata` json DEFAULT ('{}'),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_sessions_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
DROP TABLE `company_settings`;--> statement-breakpoint
DROP TABLE `user_company_roles`;--> statement-breakpoint
ALTER TABLE `users` DROP INDEX `users_auth0_id_unique`;--> statement-breakpoint
ALTER TABLE `companies` MODIFY COLUMN `id` varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE `companies` MODIFY COLUMN `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `id` varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `first_name` varchar(100);--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `last_name` varchar(100);--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `companies` ADD `slug` varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE `companies` ADD `description` text;--> statement-breakpoint
ALTER TABLE `companies` ADD `website` varchar(255);--> statement-breakpoint
ALTER TABLE `companies` ADD `status` varchar(50) DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `companies` ADD `settings` json DEFAULT ('{}');--> statement-breakpoint
ALTER TABLE `companies` ADD `metadata` json DEFAULT ('{}');--> statement-breakpoint
ALTER TABLE `users` ADD `password` varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `role` varchar(50) DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `status` varchar(50) DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `is_guest` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `last_login_at` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `metadata` json DEFAULT ('{}');--> statement-breakpoint
ALTER TABLE `companies` ADD CONSTRAINT `companies_slug_unique` UNIQUE(`slug`);--> statement-breakpoint
ALTER TABLE `company_invites` ADD CONSTRAINT `company_invites_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_companies` ADD CONSTRAINT `user_companies_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_sessions` ADD CONSTRAINT `user_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `companies` DROP COLUMN `email`;--> statement-breakpoint
ALTER TABLE `companies` DROP COLUMN `is_active`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `profile_picture`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `auth0_id`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `user_type`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `is_active`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `is_verified`;