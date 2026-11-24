import type { CreateNoteInput, TaskNote } from '@postdog/shared';
import type { Db } from '../db/client';
import { notFound } from '../lib/errors';
import { insertNote, listNotes } from '../repositories/notes';
import { findTask } from '../repositories/tasks';

export function createNoteService(db: Db) {
  function requireTask(taskId: number): void {
    if (!findTask(db, taskId)) throw notFound(`Task ${taskId} not found`);
  }

  return {
    list(taskId: number): TaskNote[] {
      requireTask(taskId);
      return listNotes(db, taskId);
    },

    create(taskId: number, input: CreateNoteInput): TaskNote {
      requireTask(taskId);
      return insertNote(db, { taskId, body: input.body, createdAt: Date.now() });
    },
  };
}

export type NoteService = ReturnType<typeof createNoteService>;
