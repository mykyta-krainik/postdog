import { and, asc, desc, eq, gte } from "drizzle-orm";
import type { Executor } from "../db/client";
import { taskNotes, type TaskNoteRow } from "../db/schema";

/** Notes of one task, oldest first. */
export function listNotes(ex: Executor, taskId: number): TaskNoteRow[] {
  return ex
    .select()
    .from(taskNotes)
    .where(eq(taskNotes.taskId, taskId))
    .orderBy(asc(taskNotes.createdAt), asc(taskNotes.id))
    .all();
}

export function listLatestNotes(
  ex: Executor,
  taskId: number,
  options: { since?: number; limit: number },
): TaskNoteRow[] {
  const conditions = [eq(taskNotes.taskId, taskId)];
  if (options.since !== undefined) conditions.push(gte(taskNotes.createdAt, options.since));
  return ex
    .select()
    .from(taskNotes)
    .where(and(...conditions))
    .orderBy(desc(taskNotes.createdAt), desc(taskNotes.id))
    .limit(options.limit)
    .all();
}

export function listNotesSince(ex: Executor, since: number): TaskNoteRow[] {
  return ex
    .select()
    .from(taskNotes)
    .where(gte(taskNotes.createdAt, since))
    .orderBy(desc(taskNotes.createdAt), desc(taskNotes.id))
    .all();
}

export function insertNote(ex: Executor, row: Omit<TaskNoteRow, "id">): TaskNoteRow {
  return ex.insert(taskNotes).values(row).returning().get();
}
