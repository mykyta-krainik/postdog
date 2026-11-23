import {
  AGENT_LIMITS,
  PRIORITY_RANK,
  type DecomposerOutcome,
  type DecomposerTaskResult,
} from "@postdog/shared";
import type { Executor } from "../../db/client";
import type { TaskRow } from "../../db/schema";
import { plural } from "../../lib/text";
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

export interface EligibilityCheck {
  runId: number;
  cooldown: ReadonlySet<number>;
  now: number;
}

export function eligibilityCheck(ex: Executor, runId: number, now: number): EligibilityCheck {
  return { runId, cooldown: listTaskIdsInCooldown(ex, now), now };
}

/**
 * Why the task is not eligible, or undefined. The run's own claim and suggestions do not
 * count, so a run can check a task again after it claimed it.
 */
export function exclusion(
  ex: Executor,
  task: TaskRow,
  { runId, cooldown, now }: EligibilityCheck,
): DecomposerTaskResult | undefined {
  const skip = (why: string) => taskResult(task, "skipped", `Skipped ${task.identifier}: ${why}`);
  if (task.parentId !== null) return skip("it is a subtask; only top-level tasks are split");
  if (task.status !== "todo") return skip(`it is ${task.status}; only todo tasks are split`);
  const subtasks = listSubtaskIds(ex, task.id).length;
  if (subtasks > 0) return skip(`it already has ${plural(subtasks, "subtask")}`);
  const claim = findActiveClaim(ex, task.id, now);
  if (claim && claim.runId !== runId) return claimedResult(task, claim);
  if (listPendingSuggestionsOfTask(ex, task.id).some((s) => s.runId !== runId)) {
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
  runId: number,
  now: number,
): Batch {
  const check = eligibilityCheck(ex, runId, now);
  const candidates = taskIds
    ? taskIds.map((id) => findTask(ex, id)).filter((task) => task !== undefined)
    : listAllTasks(ex).filter((task) => task.parentId === null && task.status === "todo");

  const eligible: TaskRow[] = [];
  const excluded: DecomposerTaskResult[] = [];
  for (const task of candidates) {
    const result = exclusion(ex, task, check);
    if (!result) eligible.push(task);
    else if (taskIds || result.outcome === "claimed") excluded.push(result);
  }
  eligible.sort(byPriorityThenAge);
  return { tasks: eligible.slice(0, AGENT_LIMITS.maxDecomposerTasksPerRun), excluded };
}
