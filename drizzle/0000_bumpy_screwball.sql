CREATE TABLE `guest_lists` (
	`id` varchar(36) NOT NULL,
	`company_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`added_by_id` varchar(36) NOT NULL,
	`added_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `guest_lists_id` PRIMARY KEY(`id`),
	CONSTRAINT `guest_lists_company_id_user_id_unique` UNIQUE(`company_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `room_access` (
	`id` varchar(36) NOT NULL,
	`room_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`access_type` varchar(50) NOT NULL,
	`invited_by_id` varchar(36),
	`invited_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `room_access_id` PRIMARY KEY(`id`),
	CONSTRAINT `room_access_room_id_user_id_unique` UNIQUE(`room_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `companies` (
	`id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`email` varchar(255) NOT NULL,
	`logo` varchar(255),
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `companies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `company_settings` (
	`company_id` varchar(36) NOT NULL,
	`track_downloads` boolean NOT NULL DEFAULT true,
	`max_file_size` bigint NOT NULL DEFAULT 10737418240,
	`max_user_count` int NOT NULL DEFAULT 10,
	`room_limit` int NOT NULL DEFAULT 5,
	`default_storage_id` varchar(36),
	`settings` text NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `company_settings_company_id` PRIMARY KEY(`company_id`)
);
--> statement-breakpoint
CREATE TABLE `user_company_roles` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`company_id` varchar(36) NOT NULL,
	`role` varchar(50) NOT NULL,
	`joined_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_company_roles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `file_logs` (
	`id` varchar(36) NOT NULL,
	`file_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`action` varchar(50) NOT NULL,
	`metadata` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `file_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `file_shares` (
	`id` varchar(36) NOT NULL,
	`file_id` varchar(36) NOT NULL,
	`created_by_id` varchar(36) NOT NULL,
	`access_token` varchar(255) NOT NULL,
	`expires_at` timestamp,
	`max_downloads` int,
	`download_count` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `file_shares_id` PRIMARY KEY(`id`),
	CONSTRAINT `file_shares_access_token_unique` UNIQUE(`access_token`)
);
--> statement-breakpoint
CREATE TABLE `file_versions` (
	`id` varchar(36) NOT NULL,
	`file_id` varchar(36) NOT NULL,
	`version_number` int NOT NULL,
	`size` bigint NOT NULL,
	`storage_key` varchar(255) NOT NULL,
	`uploaded_by_id` varchar(36) NOT NULL,
	`encryption_key_id` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `file_versions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `files` (
	`id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`original_name` varchar(255) NOT NULL,
	`mime_type` varchar(255),
	`size` bigint NOT NULL DEFAULT 0,
	`file_type` enum('file','folder') NOT NULL,
	`parent_id` varchar(36),
	`storage_id` varchar(36) NOT NULL,
	`room_id` varchar(36) NOT NULL,
	`uploaded_by_id` varchar(36) NOT NULL,
	`storage_key` varchar(255),
	`encryption` enum('none','client_side','server_side') NOT NULL DEFAULT 'none',
	`encryption_key_id` varchar(255),
	`metadata` text,
	`delete_after` timestamp,
	`is_deleted` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `file_search_index` (
	`file_id` varchar(36) NOT NULL,
	`file_name` varchar(255) NOT NULL,
	`mime_type` varchar(100),
	`file_size` bigint,
	`created_by_id` varchar(36),
	`company_id` varchar(36),
	`room_id` varchar(36),
	`tags` text,
	`updated_at` timestamp NOT NULL,
	CONSTRAINT `file_search_index_file_id` PRIMARY KEY(`file_id`)
);
--> statement-breakpoint
CREATE TABLE `saved_searches` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`company_id` varchar(36),
	`name` varchar(255) NOT NULL,
	`search_type` varchar(50) NOT NULL,
	`search_params` text NOT NULL,
	`is_default` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `saved_searches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `search_history` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`search_type` varchar(50) NOT NULL,
	`search_params` text NOT NULL,
	`result_count` int NOT NULL,
	`execution_time_ms` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `search_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(36) NOT NULL,
	`email` varchar(255) NOT NULL,
	`first_name` varchar(100) NOT NULL,
	`last_name` varchar(100) NOT NULL,
	`profile_picture` varchar(255),
	`auth0_id` varchar(255),
	`user_type` enum('b2c','b2b') NOT NULL DEFAULT 'b2c',
	`is_active` boolean NOT NULL DEFAULT true,
	`is_verified` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`),
	CONSTRAINT `users_auth0_id_unique` UNIQUE(`auth0_id`)
);
--> statement-breakpoint
CREATE TABLE `storage_accounts` (
	`id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`company_id` varchar(36) NOT NULL,
	`storage_type` enum('vault','s3','google_drive','dropbox','azure_blob','gcp_storage') NOT NULL,
	`is_default` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `storage_accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `storage_credentials` (
	`storage_id` varchar(36) NOT NULL,
	`credentials` text NOT NULL,
	`expires_at` timestamp,
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `storage_credentials_storage_id` PRIMARY KEY(`storage_id`)
);
--> statement-breakpoint
CREATE TABLE `storage_stats` (
	`storage_id` varchar(36) NOT NULL,
	`total_size` int NOT NULL DEFAULT 0,
	`used_size` int NOT NULL DEFAULT 0,
	`file_count` int NOT NULL DEFAULT 0,
	`last_updated` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `storage_stats_storage_id` PRIMARY KEY(`storage_id`)
);
--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`company_id` varchar(36) NOT NULL,
	`created_by_id` varchar(36) NOT NULL,
	`room_type` enum('vault','p2p') NOT NULL,
	`access_level` enum('private','company','guests') NOT NULL DEFAULT 'private',
	`user_limit` int NOT NULL DEFAULT 10,
	`file_size_limit` bigint NOT NULL DEFAULT 5368709120,
	`file_expiry_days` int NOT NULL DEFAULT 7,
	`is_locked` boolean NOT NULL DEFAULT false,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `rooms_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `plans` (
	`id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`plan_type` enum('free','standard','premium','enterprise') NOT NULL,
	`price` decimal(10,2) NOT NULL,
	`billing_cycle` enum('monthly','annual') NOT NULL,
	`max_users` int NOT NULL,
	`max_storage` bigint NOT NULL,
	`max_rooms` int NOT NULL,
	`features` text NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` varchar(36) NOT NULL,
	`company_id` varchar(36) NOT NULL,
	`plan_id` varchar(36) NOT NULL,
	`status` enum('active','trialing','past_due','canceled','unpaid') NOT NULL,
	`start_date` timestamp NOT NULL,
	`end_date` timestamp,
	`canceled_at` timestamp,
	`payment_provider_id` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `name_idx` ON `file_search_index` (`file_name`);--> statement-breakpoint
CREATE INDEX `mime_idx` ON `file_search_index` (`mime_type`);--> statement-breakpoint
CREATE INDEX `created_by_idx` ON `file_search_index` (`created_by_id`);--> statement-breakpoint
CREATE INDEX `company_idx` ON `file_search_index` (`company_id`);--> statement-breakpoint
CREATE INDEX `room_idx` ON `file_search_index` (`room_id`);--> statement-breakpoint
CREATE INDEX `updated_idx` ON `file_search_index` (`updated_at`);--> statement-breakpoint
CREATE INDEX `user_idx` ON `saved_searches` (`user_id`);--> statement-breakpoint
CREATE INDEX `company_idx` ON `saved_searches` (`company_id`);--> statement-breakpoint
CREATE INDEX `type_idx` ON `saved_searches` (`search_type`);--> statement-breakpoint
CREATE INDEX `user_idx` ON `search_history` (`user_id`);--> statement-breakpoint
CREATE INDEX `created_idx` ON `search_history` (`created_at`);