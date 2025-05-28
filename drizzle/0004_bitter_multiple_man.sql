CREATE TABLE `access_control_policies` (
	`id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`room_id` varchar(36),
	`company_id` varchar(36) NOT NULL,
	`created_by_id` varchar(36) NOT NULL,
	`allowed_ip_ranges` text,
	`denied_ip_ranges` text,
	`time_restrictions` json,
	`allow_downloads` boolean NOT NULL DEFAULT true,
	`allow_sharing` boolean NOT NULL DEFAULT true,
	`allow_printing` boolean NOT NULL DEFAULT true,
	`max_concurrent_users` int,
	`require_mfa` boolean NOT NULL DEFAULT false,
	`max_session_length` int,
	`inactivity_timeout` int,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `access_control_policies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `room_members` (
	`id` varchar(36) NOT NULL,
	`room_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`role` varchar(50) NOT NULL DEFAULT 'member',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `room_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `activities` MODIFY COLUMN `action` enum('upload','download','share','delete','restore','move','rename','create_folder','join_room','leave_room','update_permissions','login','logout','password_change','view','print','copy','admin_action','system_event','subscription_change') NOT NULL;--> statement-breakpoint
ALTER TABLE `activities` ADD `company_id` varchar(36);--> statement-breakpoint
ALTER TABLE `activities` ADD `ip_address` varchar(45);--> statement-breakpoint
ALTER TABLE `activities` ADD `user_agent` varchar(255);--> statement-breakpoint
ALTER TABLE `room_members` ADD CONSTRAINT `room_members_room_id_rooms_id_fk` FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `room_members` ADD CONSTRAINT `room_members_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `room_id_idx` ON `room_members` (`room_id`);--> statement-breakpoint
CREATE INDEX `user_id_idx` ON `room_members` (`user_id`);