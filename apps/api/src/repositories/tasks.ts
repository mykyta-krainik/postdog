import {
  PRIORITIES,
  PRIORITY_RANK,
  type SortOrder,
  type TaskListItem,
  type TaskSort,
  type TaskStatus,
} from "@postdog/shared";
import { and, asc, count, desc, eq, gt, isNull, or, sql, type SQL } from "drizzle-orm";
import { alias, type SQLiteTable } from "drizzle-orm/sqlite-core";
import type { Executor } from "../db/client";
import { taskLinks, tasks, type NewTaskRow, type TaskRow } from "../db/schema";

export interface TaskListFilter {
  parentId: number | null;
  status?: TaskStatus;
  search?: string;
  sort: TaskSort;
  order: SortOrder;
}

const subtask = alias(tasks, "subtask");

const priorityRank = sql`case ${tasks.priority} ${sql.join(
  PRIORITIES.map((p) => sql`when ${p} then ${PRIORITY_RANK[p]}`),
  sql` `,
)} end`;

/** A correlated `(select count(*) ...)`. `$count` drops the base table of an alias. */
function countWhere(ex: Executor, table: SQLiteTable, where: SQL | undefined): SQL<number> {
  return sql<number>`(${ex.select({ n: count() }).from(table).where(where)})`;
}

export function findTask(ex: Executor, id: number): TaskRow | undefined {
  return ex.select().from(tasks).where(eq(tasks.id, id)).get();
}

export function listTasks(ex: Executor, filter: TaskListFilter): TaskListItem[] {
  const conditions: SQL[] = [
    filter.parentId === null ? isNull(tasks.parentId) : eq(tasks.parentId, filter.parentId),
  ];
  if (filter.status) conditions.push(eq(tasks.status, filter.status));
  if (filter.search) conditions.push(containsText(filter.search));

  const direction = filter.order === "asc" ? asc : desc;
  const ordering =
    filter.sort === "priority"
      ? [direction(priorityRank), desc(tasks.createdAt), desc(tasks.id)]
      : [direction(tasks.createdAt), direction(tasks.id)];

  return ex
    .select({
      id: tasks.id,
      identifier: tasks.identifier,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      parentId: tasks.parentId,
      aiState: tasks.aiState,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
      statusChangedAt: tasks.statusChangedAt,
      subtaskCount: countWhere(ex, subtask, eq(subtask.parentId, tasks.id)),
      subtaskDoneCount: countWhere(
        ex,
        subtask,
        and(eq(subtask.parentId, tasks.id), eq(subtask.status, "done")),
      ),
      linkCount: countWhere(
        ex,
        taskLinks,
        or(eq(taskLinks.fromTaskId, tasks.id), eq(taskLinks.toTaskId, tasks.id)),
      ),
    })
    .from(tasks)
    .where(and(...conditions))
    .orderBy(...ordering)
    .all();
}

export interface TaskSearch {
  words: string[];
  status?: TaskStatus;
  limit: number;
}

function containsText(needle: string): SQL {
  return sql`(instr(lower(${tasks.title}), lower(${needle})) > 0 or instr(lower(${tasks.description}), lower(${needle})) > 0)`;
}

export function listSubtaskIds(ex: Executor, parentId: number): number[] {
  return ex
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.parentId, parentId))
    .all()
    .map((row) => row.id);
}

export function listAllTasks(ex: Executor): TaskRow[] {
  return ex.select().from(tasks).orderBy(asc(tasks.id)).all();
}

export function searchTasks(ex: Executor, search: TaskSearch): TaskRow[] {
  const conditions = search.words.map(containsText);
  if (search.status) conditions.push(eq(tasks.status, search.status));
  return ex
    .select()
    .from(tasks)
    .where(and(...conditions))
    .orderBy(desc(tasks.updatedAt), desc(tasks.id))
    .limit(search.limit)
    .all();
}

export function countTasksUpdatedAfter(ex: Executor, after: number): number {
  return ex.select({ n: count() }).from(tasks).where(gt(tasks.updatedAt, after)).get()?.n ?? 0;
}

export function insertTask(ex: Executor, row: NewTaskRow): TaskRow {
  return ex.insert(tasks).values(row).returning().get();
}

export function updateTask(ex: Executor, id: number, changes: Partial<NewTaskRow>): void {
  ex.update(tasks).set(changes).where(eq(tasks.id, id)).run();
}

export function deleteTask(ex: Executor, id: number): boolean {
  return ex.delete(tasks).where(eq(tasks.id, id)).run().changes > 0;
}
