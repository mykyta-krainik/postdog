'use client';

import {
  listNotesResponseSchema,
  taskNoteSchema,
  type CreateNoteInput,
  type ListNotesResponse,
  type TaskNote,
} from '@postdog/shared';
import useSWR, { mutate } from 'swr';
import { apiRequest, fetcherFor } from '@/shared/api';
import { appendNote } from '../model/notes';
import { taskKeys } from './keys';

const fetchNotes = fetcherFor(listNotesResponseSchema);

/** The notes of one task, oldest first. Pass undefined to skip the request. */
export function useTaskNotes(taskId: number | undefined) {
  return useSWR(taskId === undefined ? null : taskKeys.notes(taskId), fetchNotes);
}

/**
 * Adds a note and puts it at the end of the cached timeline. A note never changes a task row,
 * so no list or detail refetches. A timeline that has not loaded yet is fetched instead.
 */
export async function createNote(taskId: number, input: CreateNoteInput): Promise<TaskNote> {
  const key = taskKeys.notes(taskId);
  const note = await apiRequest(key, taskNoteSchema, { method: 'POST', body: input });
  await mutate<ListNotesResponse | undefined>(key, (list) => appendNote(list, note), {
    revalidate: (list) => list === undefined,
  });
  return note;
}
