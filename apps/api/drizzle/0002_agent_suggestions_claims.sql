CREATE TABLE `agent_claims` (
	`task_id` integer PRIMARY KEY NOT NULL,
	`run_id` integer NOT NULL,
	`agent` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `agent_claims_run_id_idx` ON `agent_claims` (`run_id`);--> statement-breakpoint
CREATE TABLE `agent_suggestions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`target_type` text NOT NULL,
	`target_id` integer NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `agent_suggestions_target_status_idx` ON `agent_suggestions` (`target_type`,`target_id`,`status`);--> statement-breakpoint
CREATE INDEX `agent_suggestions_run_id_idx` ON `agent_suggestions` (`run_id`);