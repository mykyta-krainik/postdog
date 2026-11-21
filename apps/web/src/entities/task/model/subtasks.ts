import type { TaskStatus } from "@postdog/shared";

export type SubtaskProgress = {
  done: number;
  total: number;
  counts: Record<TaskStatus, number>;
};

export function subtaskProgress(subtasks: readonly { status: TaskStatus }[]): SubtaskProgress {
  const counts: Record<TaskStatus, number> = { todo: 0, in_progress: 0, done: 0 };
  for (const { status } of subtasks) counts[status] += 1;
  return { done: counts.done, total: subtasks.length, counts };
}

/** The status a done toggle moves to: an open task becomes done, a done task reopens as todo. */
export function toggledStatus(status: TaskStatus): TaskStatus {
  return status === "done" ? "todo" : "done";
}
