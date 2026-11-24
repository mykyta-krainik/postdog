import type { RollbackKeptReason } from '@postdog/shared';
import type { TaskLinkRow, TaskRow } from '../db/schema';

export type SubtaskSnapshot = Pick<
  TaskRow,
  'status' | 'createdAt' | 'updatedAt' | 'statusChangedAt'
>;

/**
 * Why a rollback must keep a subtask the changeset created, or null when it is untouched and
 * may be deleted. Untouched means it still exists, its status is still todo and never changed,
 * the user never edited it (updatedAt is createdAt), and it has no subtasks of its own. The
 * first reason that applies wins, so a status change reads as status_changed, not edited.
 * A subtask with notes is kept too: adding a note does not bump updatedAt, but deleting the
 * subtask would delete the user's notes with it (phase 4 decision, spec 8.2). The same holds
 * for links someone other than the changeset's run made: they cascade with the subtask.
 */
export function subtaskKeptReason(
  task: SubtaskSnapshot | undefined,
  childCount: number,
  noteCount = 0,
  foreignLinkCount = 0,
): RollbackKeptReason | null {
  if (!task) return 'not_found';
  if (task.status !== 'todo' || task.statusChangedAt !== task.createdAt) return 'status_changed';
  if (task.updatedAt !== task.createdAt) return 'edited';
  if (childCount > 0) return 'has_children';
  if (noteCount > 0) return 'has_notes';
  if (foreignLinkCount > 0) return 'has_links';
  return null;
}

/** A link cannot be edited, so it is untouched while it exists. */
export function linkKeptReason(link: TaskLinkRow | undefined): RollbackKeptReason | null {
  return link ? null : 'not_found';
}

export function isUntouchedSubtask(
  task: SubtaskSnapshot | undefined,
  childCount: number,
  noteCount = 0,
  foreignLinkCount = 0,
): boolean {
  return subtaskKeptReason(task, childCount, noteCount, foreignLinkCount) === null;
}

export function isUntouchedLink(link: TaskLinkRow | undefined): boolean {
  return linkKeptReason(link) === null;
}
