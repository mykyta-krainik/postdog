import {
  AGENT_LIMITS,
  PRIORITY_RANK,
  type DecomposerOutcome,
  type DecomposerTaskResult,
} from "@postdog/shared";
import type { Executor } from "../../db/client";
import type { TaskRow } from "../../db/schema";
import { findActiveClaim, type ClaimHolder } from "../../repositories/claims";
import {
  listPendingSuggestionsOfTask,
  listTaskIdsInCooldown,
} from "../../repositories/suggestions";
import { findTask, listAllTasks, listSubtaskIds } from "../../repositories/tasks";

export interface Batch {
  tasks: TaskRow[];
  excluded: DecomposerTaskResult[];
}

export function taskResult(
  task: Pick<TaskRow, "id" | "identifier" | "title">,
  outcome: DecomposerOutcome,
  detail: string,
  suggestionId: number | null = null,
): DecomposerTaskResult {
  const { id: taskId, identifier, title } = task;
  return { taskId, identifier, title, outcome, suggestionId, detail };
}

export function claimedResult(task: TaskRow, holder: ClaimHolder): DecomposerTaskResult {
  const agent = holder.agent.replace(/_/g, " ");
  return taskResult(
    task,
    "claimed",
    `Skipped ${task.identifier}: being processed by ${agent} run #${holder.runId}`,
  );
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function exclusion(
  ex: Executor,
  task: TaskRow,
  cooldown: ReadonlySet<number>,
  now: number,
): DecomposerTaskResult | undefined {
  const skip = (why: string) => taskResult(task, "skipped", `Skipped ${task.identifier}: ${why}`);
  if (task.parentId !== null) return skip("it is a subtask; only top-level tasks are split");
  if (task.status !== "todo") return skip(`it is ${task.status}; only todo tasks are split`);
  const subtasks = listSubtaskIds(ex, task.id).length;
  if (subtasks > 0) return skip(`it already has ${plural(subtasks, "subtask")}`);
  const claim = findActiveClaim(ex, task.id, now);
  if (claim) return claimedResult(task, claim);
  if (listPendingSuggestionsOfTask(ex, task.id).length > 0) {
    return skip("it has a pending suggestion to review first");
  }
  if (cooldown.has(task.id)) {
    return skip("a suggestion for it was rejected or rolled back in the last 7 days");
  }
  return undefined;
}

function byPriorityThenAge(a: TaskRow, b: TaskRow): number {
  return (
    PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] ||
    a.createdAt - b.createdAt ||
    a.id - b.id
  );
}

/**
 * Stage 0. Without taskIds, every open top-level todo task is a candidate, and only
 * claimed ones are reported. With taskIds, every task is reported with why it was left out.
 */
export function selectBatch(
  ex: Executor,
  taskIds: readonly number[] | undefined,
  now: number,
): Batch {
  const cooldown = listTaskIdsInCooldown(ex, now);
  const candidates = taskIds
    ? taskIds.map((id) => findTask(ex, id)).filter((task) => task !== undefined)
    : listAllTasks(ex).filter((task) => task.parentId === null && task.status === "todo");

  const eligible: TaskRow[] = [];
  const excluded: DecomposerTaskResult[] = [];
  for (const task of candidates) {
    const result = exclusion(ex, task, cooldown, now);
    if (!result) eligible.push(task);
    else if (taskIds || result.outcome === "claimed") excluded.push(result);
  }
  eligible.sort(byPriorityThenAge);
  return { tasks: eligible.slice(0, AGENT_LIMITS.maxDecomposerTasksPerRun), excluded };
}
