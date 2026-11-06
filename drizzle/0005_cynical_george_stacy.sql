CREATE TABLE `market_listings` (
	`job_id` text PRIMARY KEY NOT NULL,
	`data_json` text NOT NULL,
	`checked_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`availability` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `job_documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `market_fresh` ON `market_listings` (`expires_at`,`availability`);--> statement-breakpoint
CREATE TABLE `market_queries` (
	`id` text PRIMARY KEY NOT NULL,
	`query_json` text NOT NULL,
	`job_ids_json` text DEFAULT '[]' NOT NULL,
	`next_search_at` text NOT NULL,
	`updated_at` text NOT NULL
);
