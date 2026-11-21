CREATE TABLE `agent_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agent` text NOT NULL,
	`mode` text,
	`status` text NOT NULL,
	`prompt_version` text NOT NULL,
	`input` text NOT NULL,
	`output` text,
	`trace` text NOT NULL,
	`error` text,
	`langfuse_trace_id` text,
	`usage` text,
	`llm` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer
);
--> statement-breakpoint
CREATE INDEX `agent_runs_agent_started_at_idx` ON `agent_runs` (`agent`,`started_at`);--> statement-breakpoint
CREATE INDEX `agent_runs_status_idx` ON `agent_runs` (`status`);