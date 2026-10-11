CREATE TABLE `scrutin_debates` (
	`scrutin_uid` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`cr_ref` text NOT NULL,
	`url` text,
	`turns` text NOT NULL,
	`hash` text NOT NULL,
	`extracted_at` text NOT NULL,
	`explanation` text,
	`explain_model` text,
	`explained_at` text
);
