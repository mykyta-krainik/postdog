import type {
  AgentWarning,
  ClarificationPayload,
  ProposeSubtasksInput,
  RelatedPayload,
  SubtasksPayload,
} from "@postdog/shared";
import type { Executor } from "../../db/client";
import type { TaskRow } from "../../db/schema";
import { findTask, listTasks } from "../../repositories/tasks";
import { findLink } from "../../repositories/links";
import { truncate } from "../core/trace";

export type Decision =
  | { kind: "subtasks"; payload: SubtasksPayload }
  | { kind: "clarification"; payload: ClarificationPayload }
  | { kind: "skip"; detail: string };

export interface Dropped {
  item: unknown;
  warning: AgentWarning;
}

const WARNING_MAX = 300;

function warning(message: string, taskId?: number): AgentWarning {
  return { ...(taskId !== undefined && { taskId }), message: truncate(message, WARNING_MAX) };
}

function groupKey(taskIds: readonly number[]): string {
  return [...taskIds].sort((a, b) => a - b).join(",");
}

export function sameGroup(a: readonly number[], b: readonly number[]): boolean {
  return groupKey(a) === groupKey(b);
}

function whyNotGroupable(ex: Executor, id: number, batchIds: ReadonlySet<number>): string | null {
  if (batchIds.has(id)) return null;
  const task = findTask(ex, id);
  if (!task) return `task ${id} does not exist`;
  if (task.parentId !== null) return `${task.identifier} is a subtask`;
  if (task.status === "done") return `${task.identifier} is done`;
  return null;
}

/** Ids exist and are in the batch or open top-level tasks; 2 or more per group; no repeats. */
export function checkRelatedGroups(
  ex: Executor,
  groups: readonly RelatedPayload[],
  batch: readonly TaskRow[],
): { groups: RelatedPayload[]; dropped: Dropped[] } {
  const batchIds = new Set(batch.map((task) => task.id));
  const kept: RelatedPayload[] = [];
  const dropped: Dropped[] = [];

  for (const group of groups) {
    const taskIds: number[] = [];
    for (const id of group.taskIds) {
      const why = whyNotGroupable(ex, id, batchIds);
      if (why)
        dropped.push({ item: group, warning: warning(`Left ${why} out of a related group.`) });
      else taskIds.push(id);
    }
    const drop = (why: string) =>
      dropped.push({ item: group, warning: warning(`Dropped a related group: ${why}.`) });
    if (taskIds.length < 2) drop("fewer than 2 valid tasks were left");
    else if (!taskIds.some((id) => batchIds.has(id))) drop("none of its tasks is in this run");
    else if (kept.some((other) => sameGroup(other.taskIds, taskIds))) drop("it repeats a group");
    else if (isAlreadyLinked(ex, group.relation, taskIds)) drop("its tasks are already linked");
    else kept.push({ ...group, taskIds: [...taskIds].sort((a, b) => a - b) });
  }
  return { groups: kept, dropped };
}

/** Accepting a related suggestion links the lowest id to every other task (a star). */
function isAlreadyLinked(ex: Executor, relation: RelatedPayload["relation"], taskIds: number[]) {
  const [first, ...rest] = [...taskIds].sort((a, b) => a - b);
  if (first === undefined) return false;
  const type = relation === "duplicates" ? "duplicates" : "relates";
  return rest.every(
    (id) =>
      findLink(ex, first, id, type) !== undefined || findLink(ex, id, first, type) !== undefined,
  );
}

const normalize = (title: string) => title.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Drops subtasks that repeat the task's title, an existing subtask or an earlier
 * subtask in the proposal. Fewer than 2 left makes the decision a skip.
 */
export function checkProposal(
  ex: Executor,
  task: TaskRow,
  proposal: ProposeSubtasksInput,
): { decision: Decision; dropped: Dropped[] } {
  const parentTitle = normalize(task.title);
  const existing = new Set(
    listTasks(ex, { parentId: task.id, sort: "createdAt", order: "asc" }).map((s) =>
      normalize(s.title),
    ),
  );
  const seen = new Set<string>();
  const kept: SubtasksPayload["subtasks"] = [];
  const dropped: Dropped[] = [];

  for (const subtask of proposal.subtasks) {
    const key = normalize(subtask.title);
    const why =
      key === parentTitle
        ? "it repeats the task's own title"
        : existing.has(key)
          ? "it duplicates an existing subtask"
          : seen.has(key)
            ? "it duplicates another proposed subtask"
            : null;
    if (why) {
      dropped.push({
        item: subtask,
        warning: warning(
          `${task.identifier}: dropped the subtask "${subtask.title}": ${why}.`,
          task.id,
        ),
      });
      continue;
    }
    seen.add(key);
    kept.push(subtask);
  }

  if (kept.length < 2) {
    const why =
      kept.length === 0
        ? "all proposed subtasks were duplicates"
        : "only one proposed subtask was not a duplicate";
    return { decision: { kind: "skip", detail: `already_atomic: ${why}` }, dropped };
  }
  return { decision: { kind: "subtasks", payload: { ...proposal, subtasks: kept } }, dropped };
}
