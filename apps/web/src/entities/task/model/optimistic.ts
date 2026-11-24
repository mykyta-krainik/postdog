import type { ListTasksResponse, TaskDetail, UpdateTaskInput } from '@postdog/shared';

/** The only fields the UI changes before the API confirms. */
export type OptimisticTaskPatch = Pick<UpdateTaskInput, 'status' | 'priority'>;

const OPTIMISTIC_FIELDS: ReadonlySet<string> = new Set(['status', 'priority']);

export function isOptimisticPatch(patch: UpdateTaskInput): patch is OptimisticTaskPatch {
  const fields = Object.keys(patch);
  return fields.length > 0 && fields.every((field) => OPTIMISTIC_FIELDS.has(field));
}

/** A cached response under a task list key or a task detail key. */
export type TaskCacheEntry = ListTasksResponse | TaskDetail;

/**
 * Returns the cache entry with the patch applied to task `id`, wherever the entry holds it:
 * a list item, the detail itself, or one of the detail's subtasks.
 */
export function patchTaskCache(
  entry: TaskCacheEntry | undefined,
  id: number,
  patch: OptimisticTaskPatch,
): TaskCacheEntry | undefined {
  if (!entry) return entry;
  const changes = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as OptimisticTaskPatch;
  const apply = <T extends { id: number }>(task: T): T =>
    task.id === id ? { ...task, ...changes } : task;

  if ('items' in entry) return { ...entry, items: entry.items.map(apply) };
  return { ...apply(entry), subtasks: entry.subtasks.map(apply) };
}
