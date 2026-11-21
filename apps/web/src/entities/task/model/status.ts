import { TASK_STATUSES, type TaskStatus } from "@postdog/shared";

/** Display rank of each status. Active work comes first, finished work last. */
const STATUS_RANK: Record<TaskStatus, number> = { in_progress: 0, todo: 1, done: 2 };

export const TASK_STATUS_ORDER: readonly TaskStatus[] = [...TASK_STATUSES].sort(
  (a, b) => STATUS_RANK[a] - STATUS_RANK[b],
);

export type TaskGroup<T> = { status: TaskStatus; tasks: T[] };

/** Groups tasks by status in display order. Empty groups are left out, and each group keeps the input order. */
export function groupTasksByStatus<T extends { status: TaskStatus }>(
  tasks: readonly T[],
): TaskGroup<T>[] {
  return TASK_STATUS_ORDER.map((status) => ({
    status,
    tasks: tasks.filter((task) => task.status === status),
  })).filter((group) => group.tasks.length > 0);
}
