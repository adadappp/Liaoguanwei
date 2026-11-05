CREATE TABLE `query_job_matches` (
	`topic_id` text NOT NULL,
	`job_id` text NOT NULL,
	`matched_at` text NOT NULL,
	PRIMARY KEY(`topic_id`, `job_id`),
	FOREIGN KEY (`topic_id`) REFERENCES `search_topics`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `job_documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `query_job_matches_job` ON `query_job_matches` (`job_id`);