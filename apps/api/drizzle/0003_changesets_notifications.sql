CREATE TABLE `agent_changesets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`ops` text NOT NULL,
	`status` text DEFAULT 'applied' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_changesets_run_id_unique` ON `agent_changesets` (`run_id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`run_id` integer,
	`changeset_id` integer,
	`read_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`changeset_id`) REFERENCES `agent_changesets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `notifications_read_at_created_at_idx` ON `notifications` (`read_at`,`created_at`);