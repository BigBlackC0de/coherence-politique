ALTER TABLE `politicians` ADD `mandate_start` text;--> statement-breakpoint
ALTER TABLE `politicians` ADD `mandate_end` text;--> statement-breakpoint
ALTER TABLE `posts` ADD `kind` text DEFAULT 'tweet' NOT NULL;--> statement-breakpoint
ALTER TABLE `posts` ADD `title` text;--> statement-breakpoint
ALTER TABLE `posts` ADD `chamber` text;--> statement-breakpoint
ALTER TABLE `posts` ADD `source_ref` text;--> statement-breakpoint
CREATE INDEX `posts_politician_idx` ON `posts` (`politician_id`);--> statement-breakpoint
CREATE INDEX `posts_kind_idx` ON `posts` (`kind`);