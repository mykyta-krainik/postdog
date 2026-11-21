import type { LinkType, TaskDetailLink } from "@postdog/shared";
import { and, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { Executor } from "../db/client";
import { taskLinks, tasks, type TaskLinkRow } from "../db/schema";

const other = alias(tasks, "other");

const linkWithOtherTask = {
  id: taskLinks.id,
  type: taskLinks.type,
  task: {
    id: other.id,
    identifier: other.identifier,
    title: other.title,
    status: other.status,
  },
};

export function findLink(
  ex: Executor,
  fromTaskId: number,
  toTaskId: number,
  type: LinkType,
): TaskLinkRow | undefined {
  return ex
    .select()
    .from(taskLinks)
    .where(
      and(
        eq(taskLinks.fromTaskId, fromTaskId),
        eq(taskLinks.toTaskId, toTaskId),
        eq(taskLinks.type, type),
      ),
    )
    .get();
}

/** Links of one task in both directions, oldest first. */
export function listLinksOfTask(ex: Executor, taskId: number): TaskDetailLink[] {
  const outgoing = ex
    .select(linkWithOtherTask)
    .from(taskLinks)
    .innerJoin(other, eq(other.id, taskLinks.toTaskId))
    .where(eq(taskLinks.fromTaskId, taskId))
    .all()
    .map((link) => ({ ...link, direction: "out" as const }));
  const incoming = ex
    .select(linkWithOtherTask)
    .from(taskLinks)
    .innerJoin(other, eq(other.id, taskLinks.fromTaskId))
    .where(eq(taskLinks.toTaskId, taskId))
    .all()
    .map((link) => ({ ...link, direction: "in" as const }));
  return [...outgoing, ...incoming].sort((a, b) => a.id - b.id);
}

export function insertLink(ex: Executor, row: Omit<TaskLinkRow, "id">): TaskLinkRow {
  return ex.insert(taskLinks).values(row).returning().get();
}

export function deleteLink(ex: Executor, id: number): boolean {
  return ex.delete(taskLinks).where(eq(taskLinks.id, id)).run().changes > 0;
}
