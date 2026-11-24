import {
  AGENT_NAMES,
  AI_STATES,
  CHANGESET_STATUSES,
  DECOMPOSITION_MODES,
  LINK_TYPES,
  NOTIFICATION_KINDS,
  PRIORITIES,
  RUN_STATUSES,
  RUN_TRIGGERS,
  SUGGESTION_KINDS,
  SUGGESTION_STATUSES,
  SUGGESTION_TARGET_TYPES,
  TASK_STATUSES,
  type AgentRunError,
  type AgentUsage,
  type ChangesetOp,
  type DecompositionMode,
  type LinkCreatedBy,
  type LlmInfo,
  type ScheduledAgent,
  type TraceStep,
} from "@postdog/shared";
import {
  type AnySQLiteColumn,
  index,
  integer,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const tasks = sqliteTable(
  "tasks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    identifier: text("identifier").notNull().unique(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status", { enum: TASK_STATUSES }).notNull().default("todo"),
    priority: text("priority", { enum: PRIORITIES }).notNull().default("medium"),
    parentId: integer("parent_id").references((): AnySQLiteColumn => tasks.id, {
      onDelete: "cascade",
    }),
    aiState: text("ai_state", { enum: AI_STATES }).notNull().default("none"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    statusChangedAt: integer("status_changed_at").notNull(),
  },
  (t) => [index("tasks_parent_id_idx").on(t.parentId)],
);

export const taskNotes = sqliteTable(
  "task_notes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    taskId: integer("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("task_notes_task_id_idx").on(t.taskId)],
);

export const taskLinks = sqliteTable(
  "task_links",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fromTaskId: integer("from_task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    toTaskId: integer("to_task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    type: text("type", { enum: LINK_TYPES }).notNull(),
    createdBy: text("created_by").$type<LinkCreatedBy>().notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    unique("task_links_from_to_type_unique").on(t.fromTaskId, t.toTaskId, t.type),
    index("task_links_to_task_id_idx").on(t.toTaskId),
  ],
);

export type StoredSettings = {
  aiEnabled: boolean;
  decompositionMode: DecompositionMode;
  scheduledRunsEnabled: boolean;
  identifierCounter: number;
  seededAt: number;
} & {
  /** The local date (YYYY-MM-DD) of the agent's latest scheduled slot that fired or was skipped. */
  [A in ScheduledAgent as `lastScheduledRun:${A}`]: string;
};
export type SettingKey = keyof StoredSettings;

export const settings = sqliteTable("settings", {
  key: text("key").$type<SettingKey>().primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
});

export const agentRuns = sqliteTable(
  "agent_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    agent: text("agent", { enum: AGENT_NAMES }).notNull(),
    mode: text("mode", { enum: DECOMPOSITION_MODES }),
    status: text("status", { enum: RUN_STATUSES }).notNull(),
    trigger: text("trigger", { enum: RUN_TRIGGERS }).notNull().default("manual"),
    promptVersion: text("prompt_version").notNull(),
    input: text("input", { mode: "json" }).$type<unknown>().notNull(),
    output: text("output", { mode: "json" }).$type<unknown>(),
    trace: text("trace", { mode: "json" }).$type<TraceStep[]>().notNull(),
    error: text("error", { mode: "json" }).$type<AgentRunError>(),
    langfuseTraceId: text("langfuse_trace_id"),
    usage: text("usage", { mode: "json" }).$type<AgentUsage>(),
    llm: text("llm", { mode: "json" }).$type<LlmInfo>().notNull(),
    startedAt: integer("started_at").notNull(),
    finishedAt: integer("finished_at"),
  },
  (t) => [
    index("agent_runs_agent_started_at_idx").on(t.agent, t.startedAt),
    index("agent_runs_status_idx").on(t.status),
  ],
);

export const agentSuggestions = sqliteTable(
  "agent_suggestions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: integer("run_id")
      .notNull()
      .references(() => agentRuns.id),
    targetType: text("target_type", { enum: SUGGESTION_TARGET_TYPES }).notNull(),
    targetId: integer("target_id").notNull(),
    kind: text("kind", { enum: SUGGESTION_KINDS }).notNull(),
    payload: text("payload", { mode: "json" }).$type<unknown>().notNull(),
    status: text("status", { enum: SUGGESTION_STATUSES }).notNull().default("pending"),
    createdAt: integer("created_at").notNull(),
    resolvedAt: integer("resolved_at"),
  },
  (t) => [
    index("agent_suggestions_target_status_idx").on(t.targetType, t.targetId, t.status),
    index("agent_suggestions_run_id_idx").on(t.runId),
  ],
);

export const agentClaims = sqliteTable(
  "agent_claims",
  {
    taskId: integer("task_id")
      .primaryKey()
      .references(() => tasks.id, { onDelete: "cascade" }),
    runId: integer("run_id")
      .notNull()
      .references(() => agentRuns.id),
    agent: text("agent", { enum: AGENT_NAMES }).notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (t) => [index("agent_claims_run_id_idx").on(t.runId)],
);

export const agentChangesets = sqliteTable(
  "agent_changesets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: integer("run_id")
      .notNull()
      .references(() => agentRuns.id),
    ops: text("ops", { mode: "json" }).$type<ChangesetOp[]>().notNull(),
    status: text("status", { enum: CHANGESET_STATUSES }).notNull().default("applied"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("agent_changesets_run_id_unique").on(t.runId)],
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind", { enum: NOTIFICATION_KINDS }).notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    runId: integer("run_id").references(() => agentRuns.id),
    changesetId: integer("changeset_id").references(() => agentChangesets.id),
    readAt: integer("read_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("notifications_read_at_created_at_idx").on(t.readAt, t.createdAt)],
);

export type TaskRow = typeof tasks.$inferSelect;
export type NewTaskRow = typeof tasks.$inferInsert;
export type TaskNoteRow = typeof taskNotes.$inferSelect;
export type TaskLinkRow = typeof taskLinks.$inferSelect;
export type AgentRunRow = typeof agentRuns.$inferSelect;
export type NewAgentRunRow = typeof agentRuns.$inferInsert;
export type AgentSuggestionRow = typeof agentSuggestions.$inferSelect;
export type AgentClaimRow = typeof agentClaims.$inferSelect;
export type AgentChangesetRow = typeof agentChangesets.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
export type NewNotificationRow = typeof notifications.$inferInsert;
