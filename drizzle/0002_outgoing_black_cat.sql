CREATE TABLE `company_members` (
	`id` varchar(128) NOT NULL,
	`company_id` varchar(128) NOT NULL,
	`user_id` varchar(128) NOT NULL,
	`role` varchar(50) NOT NULL,
	`joined_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `company_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `company_settings` (
	`id` varchar(128) NOT NULL,
	`company_id` varchar(128) NOT NULL,
	`allow_guest_uploads` boolean NOT NULL DEFAULT false,
	`max_file_size` int NOT NULL DEFAULT 100,
	`allowed_file_types` json NOT NULL DEFAULT ('[]'),
	`storage_quota` int NOT NULL DEFAULT 1000,
	`custom_branding` json,
	`notifications` json,
	`security` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `company_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `companies` DROP INDEX `companies_slug_unique`;--> statement-breakpoint
ALTER TABLE `companies` MODIFY COLUMN `name` varchar(100) NOT NULL;--> statement-breakpoint
ALTER TABLE `company_invites` MODIFY COLUMN `role` varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE `company_invites` MODIFY COLUMN `token` varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE `company_invites` MODIFY COLUMN `status` varchar(20) NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `companies` ADD `industry` varchar(50);--> statement-breakpoint
ALTER TABLE `companies` ADD `size` varchar(20);--> statement-breakpoint
ALTER TABLE `companies` ADD `location` varchar(100);--> statement-breakpoint
ALTER TABLE `company_members` ADD CONSTRAINT `company_members_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `company_settings` ADD CONSTRAINT `company_settings_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `companies` DROP COLUMN `slug`;--> statement-breakpoint
ALTER TABLE `companies` DROP COLUMN `status`;--> statement-breakpoint
ALTER TABLE `companies` DROP COLUMN `settings`;--> statement-breakpoint
ALTER TABLE `companies` DROP COLUMN `metadata`;--> statement-breakpoint
ALTER TABLE `company_invites` DROP COLUMN `metadata`;