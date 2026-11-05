CREATE TABLE `interview_question_links` (
	`topic_id` text NOT NULL,
	`question_id` text NOT NULL,
	PRIMARY KEY(`topic_id`, `question_id`),
	FOREIGN KEY (`topic_id`) REFERENCES `interview_topics`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_id`) REFERENCES `interview_questions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `interview_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`question` text NOT NULL,
	`original_question` text NOT NULL,
	`answer` text NOT NULL,
	`skills_json` text NOT NULL,
	`roles_json` text NOT NULL,
	`difficulty` text NOT NULL,
	`source_url` text NOT NULL,
	`source_title` text NOT NULL,
	`source_kind` text NOT NULL,
	`report_quote` text NOT NULL,
	`license` text NOT NULL,
	`source_hash` text NOT NULL,
	`verified_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `interview_verified` ON `interview_questions` (`verified_at`);--> statement-breakpoint
CREATE TABLE `interview_topics` (
	`id` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`skills_json` text NOT NULL,
	`job_ids_json` text NOT NULL,
	`updated_at` text NOT NULL,
	`next_search_at` text
);
