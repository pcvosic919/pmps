CREATE TABLE `change_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sr_id` integer NOT NULL,
	`wbs_item_id` integer,
	`requester_id` integer NOT NULL,
	`reason` text NOT NULL,
	`hours_adjustment` real DEFAULT 0 NOT NULL,
	`amount_adjustment` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending_business' NOT NULL,
	`rejection_reason` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`sr_id`) REFERENCES `service_requests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`wbs_item_id`) REFERENCES `wbs_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requester_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `cost_rates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`daily_rate` real NOT NULL,
	`hourly_rate` real NOT NULL,
	`currency` text DEFAULT 'TWD' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cost_rates_user_id_unique` ON `cost_rates` (`user_id`);--> statement-breakpoint
CREATE TABLE `custom_field_values` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`field_id` integer NOT NULL,
	`entity_id` integer NOT NULL,
	`value` text,
	FOREIGN KEY (`field_id`) REFERENCES `custom_fields`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `custom_fields` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_type` text NOT NULL,
	`name` text NOT NULL,
	`field_type` text NOT NULL,
	`options` text,
	`is_read` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `monthly_settlements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`month_str` text NOT NULL,
	`total_cost` real NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `monthly_settlements_month_str_unique` ON `monthly_settlements` (`month_str`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`type` text NOT NULL,
	`message` text NOT NULL,
	`is_read` integer DEFAULT false NOT NULL,
	`action_url` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `opportunities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`customer_name` text NOT NULL,
	`estimated_value` real NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`expected_close_date` integer,
	`owner_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `opportunity_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`opportunity_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`member_role` text DEFAULT 'assignee' NOT NULL,
	FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `presales_assignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`opportunity_id` integer NOT NULL,
	`tech_id` integer NOT NULL,
	`estimated_hours` real NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tech_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `presales_settlements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`month_str` text NOT NULL,
	`total_cost` real NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `presales_settlements_month_str_unique` ON `presales_settlements` (`month_str`);--> statement-breakpoint
CREATE TABLE `presales_timesheets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`opportunity_id` integer NOT NULL,
	`tech_id` integer NOT NULL,
	`work_date` integer NOT NULL,
	`hours` real NOT NULL,
	`description` text NOT NULL,
	`cost_amount` real NOT NULL,
	`settlement_id` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tech_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `project_timesheets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`wbs_item_id` integer NOT NULL,
	`tech_id` integer NOT NULL,
	`work_date` integer NOT NULL,
	`hours` real NOT NULL,
	`description` text NOT NULL,
	`cost_amount` real NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`wbs_item_id`) REFERENCES `wbs_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tech_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `service_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`opportunity_id` integer,
	`title` text NOT NULL,
	`contract_amount` real NOT NULL,
	`pm_id` integer NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`margin_estimate` real DEFAULT 0 NOT NULL,
	`margin_warning` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pm_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `skill_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `skill_categories_name_unique` ON `skill_categories` (`name`);--> statement-breakpoint
CREATE TABLE `sr_attachments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sr_id` integer NOT NULL,
	`file_name` text NOT NULL,
	`file_key` text NOT NULL,
	`file_url` text NOT NULL,
	`file_size` integer NOT NULL,
	`mime_type` text NOT NULL,
	`user_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`sr_id`) REFERENCES `service_requests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sr_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sr_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`member_role` text DEFAULT 'assignee' NOT NULL,
	FOREIGN KEY (`sr_id`) REFERENCES `service_requests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `system_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`category` text DEFAULT 'general' NOT NULL,
	`value_type` text DEFAULT 'string' NOT NULL,
	`description` text
);
--> statement-breakpoint
CREATE TABLE `user_skills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`category_id` integer NOT NULL,
	`level` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `skill_categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password` text,
	`department` text,
	`title` text,
	`role` text DEFAULT 'user' NOT NULL,
	`roles` text DEFAULT '[]' NOT NULL,
	`provider` text DEFAULT 'manual' NOT NULL,
	`provider_id` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `wbs_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`version_id` integer NOT NULL,
	`title` text NOT NULL,
	`estimated_hours` real NOT NULL,
	`actual_hours` real DEFAULT 0 NOT NULL,
	`start_date` integer,
	`end_date` integer,
	`assignee_id` integer,
	FOREIGN KEY (`version_id`) REFERENCES `wbs_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `wbs_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sr_id` integer NOT NULL,
	`version_number` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`rejection_reason` text,
	`submitted_by` integer,
	`reviewed_by` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`sr_id`) REFERENCES `service_requests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`submitted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
