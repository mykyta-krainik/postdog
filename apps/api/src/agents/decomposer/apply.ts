import {
  DEFAULT_SETTINGS,
  type AgentWarning,
  type DecomposerTaskResult,
  type DecompositionMode,
  type RelatedPayload,
  type SuggestionStatus,
} from "@postdog/shared";
import type { Executor } from "../../db/client";
import type { TaskRow } from "../../db/schema";
import { plural } from "../../lib/text";
import { appendChangesetOps, type NewChangesetOp } from "../../repositories/changesets";
import { getSetting } from "../../repositories/settings";
import {
  insertSuggestion,
  listPendingSuggestionsOfTask,
  listSuggestions,
} from "../../repositories/suggestions";
import { findTask, listSubtaskIds } from "../../repositories/tasks";
import { linkGroup } from "../../services/suggestions";
import { insertSubtasks } from "../../services/tasks";
import { truncate } from "../core/trace";
import { taskResult } from "./eligibility";
import { sameGroup, type Decision } from "./validate";

export interface ApplyRun {
  runId: number;
  startedAt: number;
  now: number;
}

export type RelatedApplied =
  { saved: true; suggestionId: number; applied: boolean } | { saved: false; warning: AgentWarning };

/**
 * Stage 3: writes one task's decision or one related group, as the run's mode says. The
 * caller runs each call in its own transaction, so a throw writes nothing of that item, and
 * calls `task` only when `writeConflict` in that transaction found nothing.
 */
export interface Applier {
  task(ex: Executor, run: ApplyRun, task: TaskRow, decision: Decision): DecomposerTaskResult;
  related(ex: Executor, run: ApplyRun, group: RelatedPayload): RelatedApplied;
}

function staleReason(current: TaskRow | undefined, identifier: string, startedAt: number) {
  if (!current) return `${identifier} was deleted while the Decomposer worked`;
  if (current.updatedAt > startedAt) return `${identifier} was edited while the Decomposer worked`;
  return null;
}

/**
 * Why nothing may be written for the task now, read in the caller's transaction, or null:
 * the user deleted, edited, finished or split it, or another run left a split or a question
 * on it. `answering` is the clarification a rerun answers, which does not count.
 */
export function writeConflict(
  ex: Executor,
  run: ApplyRun,
  task: TaskRow,
  answering?: number,
): string | null {
  const current = findTask(ex, task.id);
  const stale = staleReason(current, task.identifier, run.startedAt);
  if (stale !== null || !current) return stale;
  if (current.status === "done") return `${task.identifier} is done`;
  const subtasks = listSubtaskIds(ex, task.id).length;
  if (subtasks > 0) {
    return `${task.identifier} got ${plural(subtasks, "subtask")} while the Decomposer worked`;
  }
  const other = listPendingSuggestionsOfTask(ex, task.id).find(
    (s) => s.kind !== "related" && s.runId !== run.runId && s.id !== answering,
  );
  if (other) {
    return `${task.identifier} already has ${other.kind} suggestion #${other.id} from run #${other.runId}`;
  }
  return null;
}

function suggestionOf(run: ApplyRun, targetId: number) {
  return { runId: run.runId, targetType: "task" as const, targetId, createdAt: run.now };
}

/** The group's tasks, or why it is not saved: one of them was edited, or it is already pending. */
function checkGroup(
  ex: Executor,
  run: ApplyRun,
  group: RelatedPayload,
): { tasks: TaskRow[] } | { warning: AgentWarning } {
  const found = group.taskIds.map((id) => ({ id, row: findTask(ex, id) }));
  const names = found.map(({ id, row }) => row?.identifier ?? `task ${id}`).join(", ");
  const notSaved = (why: string) => ({
    warning: { message: truncate(`Related group ${names} was not saved: ${why}.`, 300) },
  });
  const tasks: TaskRow[] = [];
  for (const { id, row } of found) {
    const stale = staleReason(row, row?.identifier ?? `task ${id}`, run.startedAt);
    if (stale) return notSaved(stale);
    if (row) tasks.push(row);
  }
  const targetId = Math.min(...group.taskIds);
  const pending = listSuggestions(ex, { targetType: "task", targetId, status: "pending" }).find(
    (s) => s.kind === "related" && sameGroup(s.payload.taskIds, group.taskIds),
  );
  if (pending) return notSaved(`it is already pending as suggestion #${pending.id}`);
  return { tasks };
}

function saveRelated(
  ex: Executor,
  run: ApplyRun,
  group: RelatedPayload,
  status: Extract<SuggestionStatus, "pending" | "applied">,
): number {
  const targetId = Math.min(...group.taskIds);
  return insertSuggestion(ex, {
    ...suggestionOf(run, targetId),
    kind: "related",
    payload: group,
    status,
  }).id;
}

function recordOps(ex: Executor, run: ApplyRun, ops: NewChangesetOp[]): void {
  if (ops.length > 0) appendChangesetOps(ex, { runId: run.runId, ops, now: run.now });
}

const suggest: Applier = {
  task(ex, run, task, decision) {
    const base = suggestionOf(run, task.id);
    switch (decision.kind) {
      case "skip":
        return taskResult(task, "skipped", decision.detail);
      case "subtasks": {
        const saved = insertSuggestion(ex, {
          ...base,
          kind: "subtasks",
          payload: decision.payload,
        });
        const n = decision.payload.subtasks.length;
        return taskResult(task, "suggested_subtasks", `Proposed ${plural(n, "subtask")}`, saved.id);
      }
      case "clarification": {
        const { payload } = decision;
        const saved = insertSuggestion(ex, { ...base, kind: "clarification", payload });
        const asked = `Asked ${plural(payload.questions.length, "question")}`;
        return taskResult(
          task,
          "needs_clarification",
          `${asked}: ${payload.whatIsUnclear}`,
          saved.id,
        );
      }
    }
  },

  related(ex, run, group) {
    const checked = checkGroup(ex, run, group);
    if ("warning" in checked) return { saved: false, warning: checked.warning };
    return { saved: true, suggestionId: saveRelated(ex, run, group, "pending"), applied: false };
  },
};

/**
 * Auto mode creates subtasks and relates links, and nothing else: it never edits, deletes or
 * re-prioritizes a task. Clarifications, skips and duplicates groups go the suggest way.
 */
const auto: Applier = {
  task(ex, run, task, decision) {
    if (decision.kind !== "subtasks") return suggest.task(ex, run, task, decision);
    const created = insertSubtasks(ex, task.id, decision.payload.subtasks, run.now);
    recordOps(
      ex,
      run,
      created.map((subtask) => ({ type: "create_task", id: subtask.id, taskId: task.id })),
    );
    const saved = insertSuggestion(ex, {
      ...suggestionOf(run, task.id),
      kind: "subtasks",
      payload: decision.payload,
      status: "applied",
    });
    const detail = `Created ${plural(created.length, "subtask")}`;
    return taskResult(task, "applied_subtasks", detail, saved.id);
  },

  related(ex, run, group) {
    if (group.relation === "duplicates") return suggest.related(ex, run, group);
    const checked = checkGroup(ex, run, group);
    if ("warning" in checked) return { saved: false, warning: checked.warning };
    const [hub, ...others] = [...checked.tasks].sort((a, b) => a.id - b.id);
    const links = linkGroup(ex, hub!, others, group.relation, run.runId, run.now);
    recordOps(
      ex,
      run,
      links.map((link) => ({ type: "create_link", id: link.id, taskId: hub!.id })),
    );
    return { saved: true, suggestionId: saveRelated(ex, run, group, "applied"), applied: true };
  },
};

const APPLIERS: Record<DecompositionMode, Applier> = { suggest, auto };

/** The mode in Settings. A run reads it once, at its start, and keeps it. */
export function decompositionMode(ex: Executor): DecompositionMode {
  return getSetting(ex, "decompositionMode") ?? DEFAULT_SETTINGS.decompositionMode;
}

export function applierFor(mode: DecompositionMode | null): Applier {
  return APPLIERS[mode ?? "suggest"];
}
