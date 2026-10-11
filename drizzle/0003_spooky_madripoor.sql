CREATE TABLE `candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`party_id` text,
	`party_label` text,
	`status` text DEFAULT 'pressenti' NOT NULL,
	`status_set_by` text DEFAULT 'job' NOT NULL,
	`status_source` text,
	`declared_at` text,
	`birth_date` text,
	`birth_place` text,
	`tagline` text,
	`wikipedia_title` text,
	`official_site` text,
	`photo` text,
	`profile` text,
	`profile_model` text,
	`profile_at` text,
	`rejected` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `candidates_status_idx` ON `candidates` (`status`);