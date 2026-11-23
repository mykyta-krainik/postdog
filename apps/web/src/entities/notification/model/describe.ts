import type {
  ChangesetTaskState,
  ChangesetTaskSummary,
  Notification,
  NotificationKind,
  RollbackKeptReason,
} from "@postdog/shared";

/** The one-line kind label, which also stands in for an empty title. */
export const NOTIFICATION_KIND_LABEL: Record<NotificationKind, string> = {
  auto_decomposition: "Auto decomposition",
  agent_failed: "An agent run failed",
  conflict: "Skipped an edited task",
};

export function notificationTitle(notification: Pick<Notification, "kind" | "title">): string {
  return notification.title.trim() || NOTIFICATION_KIND_LABEL[notification.kind];
}

export function isUnread(notification: Pick<Notification, "readAt">): boolean {
  return notification.readAt === null;
}

/** The nav badge text: nothing at zero, "9+" above nine. */
export function unreadBadgeText(count: number | undefined): string | null {
  if (!count || count < 1) return null;
  return count > 9 ? "9+" : String(count);
}

export type ChangesetStateTone = "brand" | "muted" | "done";

export const CHANGESET_TASK_STATE_META: Record<
  ChangesetTaskState,
  { label: string; tone: ChangesetStateTone }
> = {
  applied: { label: "Applied", tone: "brand" },
  rolled_back: { label: "Rolled back", tone: "muted" },
  partially_rolled_back: { label: "Some edits kept", tone: "muted" },
  kept: { label: "Kept", tone: "done" },
};

/** Why a rollback left an item in place, written to follow its name: "PD-14 has notes". */
export const KEPT_REASON_TEXT: Record<RollbackKeptReason, string> = {
  edited: "was edited",
  has_children: "has its own subtasks",
  has_notes: "has notes",
  has_links: "has links",
  status_changed: "was started or finished",
  not_found: "was already gone",
};

/**
 * A rollback acts on every op of its scope, so a task whose part is no longer `applied` has
 * nothing left to roll back: what remains was kept on purpose.
 */
export function canRollBackTask(task: Pick<ChangesetTaskSummary, "state">): boolean {
  return task.state === "applied";
}

export function canRollBackChangeset(changeset: {
  tasks: readonly Pick<ChangesetTaskSummary, "state">[];
}): boolean {
  return changeset.tasks.some(canRollBackTask);
}

function plural(count: number, word: string): string {
  return `${count} ${count === 1 ? word : `${word}s`}`;
}

export function subtasksChip(count: number): string {
  return plural(count, "subtask");
}

export function linksChip(count: number): string {
  return plural(count, "link");
}
