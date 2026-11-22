import type { AiState, SuggestionKind } from "@postdog/shared";
import { inArray, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import type { Executor } from "../db/client";
import { agentClaims, agentSuggestions, tasks } from "../db/schema";

/** The suggestion row targets the task, or lists it in a related group. */
export function affectsTask(taskId: SQLWrapper | number): SQL {
  return sql`(${agentSuggestions.targetType} = 'task' and (${agentSuggestions.targetId} = ${taskId} or (${agentSuggestions.kind} = 'related' and exists (select 1 from json_each(${agentSuggestions.payload}, '$.taskIds') where value = ${taskId}))))`;
}

function hasActiveClaim(now: number): SQL {
  return sql`exists (select 1 from ${agentClaims} where ${agentClaims.taskId} = ${tasks.id} and ${agentClaims.expiresAt} > ${now})`;
}

function hasPending(kind?: SuggestionKind): SQL {
  const ofKind = kind ? sql` and ${agentSuggestions.kind} = ${kind}` : sql``;
  return sql`exists (select 1 from ${agentSuggestions} where ${agentSuggestions.status} = 'pending'${ofKind} and ${affectsTask(tasks.id)})`;
}

function derivedAiState(now: number): SQL<AiState> {
  const precedence: [AiState, SQL][] = [
    ["processing", hasActiveClaim(now)],
    ["clarification_pending", hasPending("clarification")],
    ["suggestion_pending", hasPending()],
  ];
  const rules = precedence.map(([state, when]) => sql`when ${when} then ${state}`);
  return sql<AiState>`case ${sql.join(rules, sql` `)} else 'none' end`;
}

/**
 * Rewrites tasks.aiState from the claims and pending suggestions. It never touches
 * updatedAt. Every claim and suggestion write calls it in its own transaction.
 */
export function recomputeAiState(ex: Executor, taskIds: readonly number[], now: number): void {
  if (taskIds.length === 0) return;
  ex.update(tasks)
    .set({ aiState: derivedAiState(now) })
    .where(inArray(tasks.id, [...new Set(taskIds)]))
    .run();
}

export function recomputeAllAiStates(ex: Executor, now: number): void {
  ex.update(tasks)
    .set({ aiState: derivedAiState(now) })
    .run();
}
