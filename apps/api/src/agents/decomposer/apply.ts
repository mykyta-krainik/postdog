import {
  DEFAULT_SETTINGS,
  type AgentWarning,
  type DecomposerTaskResult,
  type DecompositionMode,
  type RelatedPayload,
} from "@postdog/shared";
import type { Executor } from "../../db/client";
import type { TaskRow } from "../../db/schema";
import { getSetting } from "../../repositories/settings";
import { insertSuggestion, listSuggestions } from "../../repositories/suggestions";
import { findTask } from "../../repositories/tasks";
import { truncate } from "../core/trace";
import { taskResult } from "./eligibility";
import { sameGroup, type Decision } from "./validate";

export interface ApplyRun {
  runId: number;
  startedAt: number;
  now: number;
}

export type RelatedApplied =
  { saved: true; suggestionId: number } | { saved: false; warning: AgentWarning };

/** Stage 3: writes one task's decision or one related group, as the run's mode says. */
export interface Applier {
  task(ex: Executor, run: ApplyRun, task: TaskRow, decision: Decision): DecomposerTaskResult;
  related(ex: Executor, run: ApplyRun, group: RelatedPayload): RelatedApplied;
}

function staleReason(current: TaskRow | undefined, identifier: string, startedAt: number) {
  if (!current) return `${identifier} was deleted while the Decomposer worked`;
  if (current.updatedAt > startedAt) return `${identifier} was edited while the Decomposer worked`;
  return null;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

const suggest: Applier = {
  task(ex, run, task, decision) {
    const stale = staleReason(findTask(ex, task.id), task.identifier, run.startedAt);
    if (stale) return taskResult(task, "superseded", stale);
    const base = {
      runId: run.runId,
      targetType: "task" as const,
      targetId: task.id,
      createdAt: run.now,
    };
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
    const tasks = group.taskIds.map((id) => ({ id, row: findTask(ex, id) }));
    const names = tasks.map(({ id, row }) => row?.identifier ?? `task ${id}`).join(", ");
    const notSaved = (why: string): RelatedApplied => ({
      saved: false,
      warning: { message: truncate(`Related group ${names} was not saved: ${why}.`, 300) },
    });
    for (const { id, row } of tasks) {
      const stale = staleReason(row, row?.identifier ?? `task ${id}`, run.startedAt);
      if (stale) return notSaved(stale);
    }
    const targetId = Math.min(...group.taskIds);
    const pending = listSuggestions(ex, { targetType: "task", targetId, status: "pending" }).find(
      (s) => s.kind === "related" && sameGroup(s.payload.taskIds, group.taskIds),
    );
    if (pending) return notSaved(`it is already pending as suggestion #${pending.id}`);
    const saved = insertSuggestion(ex, {
      runId: run.runId,
      targetType: "task",
      targetId,
      kind: "related",
      payload: group,
      createdAt: run.now,
    });
    return { saved: true, suggestionId: saved.id };
  },
};

const APPLIERS = { suggest } satisfies Partial<Record<DecompositionMode, Applier>>;

type AppliedMode = keyof typeof APPLIERS;

function isApplied(mode: DecompositionMode): mode is AppliedMode {
  return Object.hasOwn(APPLIERS, mode);
}

export function requestedMode(ex: Executor): DecompositionMode {
  return getSetting(ex, "decompositionMode") ?? DEFAULT_SETTINGS.decompositionMode;
}

/** Phase 3 has no auto applier, so an auto setting runs as suggest. */
export function appliedMode(requested: DecompositionMode): AppliedMode {
  return isApplied(requested) ? requested : "suggest";
}

export function applierFor(mode: DecompositionMode | null): Applier {
  return APPLIERS[appliedMode(mode ?? "suggest")];
}
