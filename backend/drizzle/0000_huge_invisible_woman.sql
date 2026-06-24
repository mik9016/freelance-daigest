CREATE TABLE `chat_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`offer_id` integer NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`openwebui_chat_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`offer_id`) REFERENCES `offers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_messages_offer_id_idx` ON `chat_messages` (`offer_id`);--> statement-breakpoint
CREATE INDEX `chat_messages_created_at_idx` ON `chat_messages` (`created_at`);--> statement-breakpoint
CREATE TABLE `offers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`external_id` text NOT NULL,
	`title` text NOT NULL,
	`company` text,
	`location` text,
	`remote_pct` integer DEFAULT 0 NOT NULL,
	`contract_type` text,
	`duration` text,
	`start_date` text,
	`posted_at` text,
	`detail_url` text NOT NULL,
	`description_text` text DEFAULT '' NOT NULL,
	`raw_html` text DEFAULT '' NOT NULL,
	`search_terms` text DEFAULT '[]' NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`archived_at` text,
	`sent` integer DEFAULT 0 NOT NULL,
	`sent_at` text,
	`notes` text DEFAULT '' NOT NULL,
	`openwebui_chat_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `offers_external_id_unique` ON `offers` (`external_id`);--> statement-breakpoint
CREATE INDEX `offers_archived_idx` ON `offers` (`archived`);--> statement-breakpoint
CREATE INDEX `offers_sent_idx` ON `offers` (`sent`);--> statement-breakpoint
CREATE INDEX `offers_archived_at_idx` ON `offers` (`archived_at`);--> statement-breakpoint
CREATE INDEX `offers_posted_at_idx` ON `offers` (`posted_at`);--> statement-breakpoint
CREATE INDEX `offers_company_idx` ON `offers` (`company`);--> statement-breakpoint
CREATE TABLE `scrape_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`search_term` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`new_count` integer DEFAULT 0 NOT NULL,
	`total_count` integer DEFAULT 0 NOT NULL,
	`error` text
);
