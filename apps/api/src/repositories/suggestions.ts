import {
  AGENT_LIMITS,
  suggestionSchema,
  type Suggestion,
  type SuggestionStatus,
  type SuggestionTargetType,
} from "@postdog/shared";
import { and, asc, eq, gt, inArray, or, type SQL } from "drizzle-orm";
import type { Executor } from "../db/client";
import { agentSuggestions, type AgentSuggestionRow } from "../db/schema";
import { affectsTask, recomputeAiState } from "./aiState";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A new suggestion is always pending. */
export type NewSuggestion = DistributiveOmit<Suggestion, "id" | "status" | "resolvedAt">;

export type SuggestionResolution = Exclude<SuggestionStatus, "pending">;

export interface SuggestionFilter {
  targetType?: SuggestionTargetType;
  targetId?: number;
  status?: SuggestionStatus;
}

const oldestFirst = [asc(agentSuggestions.createdAt), asc(agentSuggestions.id)];

function toSuggestion(row: AgentSuggestionRow): Suggestion {
  return suggestionSchema.parse(row);
}

/** Every task whose aiState the suggestion counts toward. */
export function suggestionTaskIds(suggestion: Suggestion): number[] {
  return suggestion.kind === "related" ? suggestion.payload.taskIds : [suggestion.targetId];
}

export function insertSuggestion(ex: Executor, row: NewSuggestion): Suggestion {
  return ex.transaction((tx) => {
    const suggestion = toSuggestion(tx.insert(agentSuggestions).values(row).returning().get());
    recomputeAiState(tx, suggestionTaskIds(suggestion), row.createdAt);
    return suggestion;
  });
}

export function findSuggestion(ex: Executor, id: number): Suggestion | undefined {
  const row = ex.select().from(agentSuggestions).where(eq(agentSuggestions.id, id)).get();
  return row && toSuggestion(row);
}

/** Oldest first. With a task `targetId`, related suggestions that list the task match too. */
export function listSuggestions(ex: Executor, filter: SuggestionFilter): Suggestion[] {
  const conditions: SQL[] = [];
  if (filter.targetType) conditions.push(eq(agentSuggestions.targetType, filter.targetType));
  if (filter.targetId !== undefined) {
    conditions.push(
      filter.targetType === "doc"
        ? eq(agentSuggestions.targetId, filter.targetId)
        : affectsTask(filter.targetId),
    );
  }
  if (filter.status) conditions.push(eq(agentSuggestions.status, filter.status));
  return ex
    .select()
    .from(agentSuggestions)
    .where(and(...conditions))
    .orderBy(...oldestFirst)
    .all()
    .map(toSuggestion);
}

export function listPendingSuggestionsOfTask(ex: Executor, taskId: number): Suggestion[] {
  return listSuggestions(ex, { targetType: "task", targetId: taskId, status: "pending" });
}

/** Moves a pending suggestion to `status`. Undefined when it is missing or no longer pending. */
export function resolveSuggestion(
  ex: Executor,
  id: number,
  status: SuggestionResolution,
  now: number,
): Suggestion | undefined {
  return ex.transaction((tx) => {
    const row = tx
      .update(agentSuggestions)
      .set({ status, resolvedAt: now })
      .where(and(eq(agentSuggestions.id, id), eq(agentSuggestions.status, "pending")))
      .returning()
      .get();
    if (!row) return undefined;
    const suggestion = toSuggestion(row);
    recomputeAiState(tx, suggestionTaskIds(suggestion), now);
    return suggestion;
  });
}

/** Supersedes every pending suggestion that affects one of the tasks, such as before a delete. */
export function supersedeSuggestionsOfTasks(
  ex: Executor,
  taskIds: readonly number[],
  now: number,
): void {
  if (taskIds.length === 0) return;
  ex.transaction((tx) => {
    const superseded = tx
      .update(agentSuggestions)
      .set({ status: "superseded", resolvedAt: now })
      .where(and(eq(agentSuggestions.status, "pending"), or(...taskIds.map(affectsTask))))
      .returning()
      .all()
      .map(toSuggestion);
    recomputeAiState(tx, superseded.flatMap(suggestionTaskIds), now);
  });
}

/**
 * Tasks a rejected or rolled-back suggestion affected within the last
 * AGENT_LIMITS.rejectedCooldownMs. The Decomposer does not propose for them again.
 */
export function listTaskIdsInCooldown(ex: Executor, now: number): Set<number> {
  const rows = ex
    .select()
    .from(agentSuggestions)
    .where(
      and(
        eq(agentSuggestions.targetType, "task"),
        inArray(agentSuggestions.status, ["rejected", "rolled_back"]),
        gt(agentSuggestions.resolvedAt, now - AGENT_LIMITS.rejectedCooldownMs),
      ),
    )
    .all();
  return new Set(rows.map(toSuggestion).flatMap(suggestionTaskIds));
}
