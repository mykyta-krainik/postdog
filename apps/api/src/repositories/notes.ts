import { asc, eq } from "drizzle-orm";
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

export function insertNote(ex: Executor, row: Omit<TaskNoteRow, "id">): TaskNoteRow {
  return ex.insert(taskNotes).values(row).returning().get();
}
