import { STALE_IN_PROGRESS_DAYS, type PlannerContextRow } from "@postdog/shared";
import type { Executor } from "../db/client";
import type { TaskLinkRow, TaskRow } from "../db/schema";
import { listLinksOfType } from "../repositories/links";
import { listAllTasks } from "../repositories/tasks";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface TaskRef {
  id: number;
  identifier: string;
  title: string;
}

export interface TaskFacts extends PlannerContextRow {
  parentId: number | null;
  createdAt: number;
  updatedAt: number;
  statusChangedAt: number;
  isStale: boolean;
  openBlockers: TaskRef[];
}

export function wholeDaysBetween(from: number, to: number): number {
  return Math.max(0, Math.floor((to - from) / DAY_MS));
}

export function computeTaskFacts(
  tasks: readonly TaskRow[],
  blockLinks: readonly Pick<TaskLinkRow, "fromTaskId" | "toTaskId">[],
  now: number,
): TaskFacts[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const isOpen = (id: number) => {
    const task = byId.get(id);
    return task !== undefined && task.status !== "done";
  };

  return tasks.map((task) => {
    const subtasks = tasks.filter((t) => t.parentId === task.id);
    const openBlockers = blockLinks
      .filter((link) => link.toTaskId === task.id && isOpen(link.fromTaskId))
      .map((link) => byId.get(link.fromTaskId)!)
      .map(({ id, identifier, title }) => ({ id, identifier, title }));
    const daysInStatus = wholeDaysBetween(task.statusChangedAt, now);
    return {
      id: task.id,
      identifier: task.identifier,
      title: task.title,
      status: task.status,
      priority: task.priority,
      parentId: task.parentId,
      aiState: task.aiState,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      statusChangedAt: task.statusChangedAt,
      ageDays: wholeDaysBetween(task.createdAt, now),
      daysInStatus,
      subtaskDone: subtasks.filter((t) => t.status === "done").length,
      subtaskTotal: subtasks.length,
      blocksOpenCount: blockLinks.filter(
        (link) => link.fromTaskId === task.id && isOpen(link.toTaskId),
      ).length,
      isBlocked: openBlockers.length > 0,
      isStale: task.status === "in_progress" && daysInStatus > STALE_IN_PROGRESS_DAYS,
      openBlockers,
    };
  });
}

export function loadTaskFacts(ex: Executor, now: number): TaskFacts[] {
  return computeTaskFacts(listAllTasks(ex), listLinksOfType(ex, "blocks"), now);
}
