import {
  AI_STATES,
  LINK_TYPES,
  PRIORITIES,
  TASK_STATUSES,
  type DecompositionMode,
  type LinkCreatedBy,
} from "@postdog/shared";
import {
  type AnySQLiteColumn,
  index,
  integer,
  sqliteTable,
  text,
  unique,
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

export interface StoredSettings {
  aiEnabled: boolean;
  decompositionMode: DecompositionMode;
  identifierCounter: number;
  seededAt: number;
}
export type SettingKey = keyof StoredSettings;

export const settings = sqliteTable("settings", {
  key: text("key").$type<SettingKey>().primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
});

export type TaskRow = typeof tasks.$inferSelect;
export type NewTaskRow = typeof tasks.$inferInsert;
export type TaskNoteRow = typeof taskNotes.$inferSelect;
export type TaskLinkRow = typeof taskLinks.$inferSelect;
