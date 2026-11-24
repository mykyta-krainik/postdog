import type { ListNotesResponse, TaskNote } from '@postdog/shared';

/**
 * The cached timeline with a note the API just created. The timeline runs oldest first, so the
 * note goes last. A list that has not loaded stays empty, so its fetch fills it.
 */
export function appendNote(
  list: ListNotesResponse | undefined,
  note: TaskNote,
): ListNotesResponse | undefined {
  if (!list || list.items.some((item) => item.id === note.id)) return list;
  return { ...list, items: [...list.items, note] };
}
