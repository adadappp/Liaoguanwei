CREATE TABLE `request_budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`used` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`job_id` text,
	`topic_id` text,
	`kind` text NOT NULL,
	`message` text NOT NULL,
	`status` text NOT NULL,
	`resolution` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `job_documents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`topic_id`) REFERENCES `search_topics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `feedback_owner` ON `user_feedback` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `feedback_review` ON `user_feedback` (`status`,`job_id`);--> statement-breakpoint
CREATE TABLE `job_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`company` text NOT NULL,
	`city` text NOT NULL,
	`experience` text NOT NULL,
	`family` text NOT NULL,
	`branch` text NOT NULL,
	`source_id` text NOT NULL,
	`body` text NOT NULL,
	`body_hash` text NOT NULL,
	`extraction_json` text NOT NULL,
	`extraction_version` integer DEFAULT 1 NOT NULL,
	`state` text NOT NULL,
	`published_at` text,
	`first_seen_at` text NOT NULL,
	`verified_at` text NOT NULL,
	`last_attempt_at` text,
	`next_review_at` text NOT NULL,
	`stable_rounds` integer DEFAULT 0 NOT NULL,
	`failures` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_url_unique` ON `job_documents` (`url`);--> statement-breakpoint
CREATE INDEX `job_lookup` ON `job_documents` (`family`,`city`,`state`);--> statement-breakpoint
CREATE INDEX `job_review` ON `job_documents` (`next_review_at`);--> statement-breakpoint
CREATE TABLE `import_leads` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`company` text NOT NULL,
	`city` text NOT NULL,
	`state` text NOT NULL,
	`imported_at` text NOT NULL,
	`last_attempt_at` text,
	`notes` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lead_url_unique` ON `import_leads` (`url`);--> statement-breakpoint
CREATE TABLE `maintenance_leases` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`until_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `search_topics` (
	`id` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`city` text NOT NULL,
	`experience` text NOT NULL,
	`family` text NOT NULL,
	`hits` integer DEFAULT 0 NOT NULL,
	`last_seen_at` text NOT NULL,
	`last_search_at` text,
	`next_search_at` text,
	`lease_until` text,
	`lease_token` text
);
--> statement-breakpoint
CREATE TABLE `job_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`body_hash` text NOT NULL,
	`body` text NOT NULL,
	`extraction_json` text NOT NULL,
	`verified_at` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `job_documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `revision_content_unique` ON `job_revisions` (`job_id`,`body_hash`);--> statement-breakpoint
CREATE TABLE `update_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`details_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `data_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`license` text NOT NULL,
	`status` text NOT NULL,
	`notes` text NOT NULL,
	`checked_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `job_taxonomy` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`description` text NOT NULL
);
