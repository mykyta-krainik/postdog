import { AGENT_LIMITS, type AgentName } from "@postdog/shared";
import { and, eq, gt, notInArray } from "drizzle-orm";
import type { Executor } from "../db/client";
import { agentClaims, agentRuns, type AgentClaimRow } from "../db/schema";
import { recomputeAiState } from "./aiState";

export interface ClaimHolder {
  runId: number;
  agent: AgentName;
}

export type ClaimResult = { claimed: true } | { claimed: false; heldBy: ClaimHolder };

const taskIdsOf = (rows: readonly Pick<AgentClaimRow, "taskId">[]) => rows.map((r) => r.taskId);

export function findActiveClaim(
  ex: Executor,
  taskId: number,
  now: number,
): AgentClaimRow | undefined {
  return ex
    .select()
    .from(agentClaims)
    .where(and(eq(agentClaims.taskId, taskId), gt(agentClaims.expiresAt, now)))
    .get();
}

export function listActiveClaims(ex: Executor, now: number): AgentClaimRow[] {
  return ex.select().from(agentClaims).where(gt(agentClaims.expiresAt, now)).all();
}

/**
 * Claims the task for the run until now + AGENT_LIMITS.claimTtlMs. An expired claim
 * is replaced, and claiming a task the run already holds renews it.
 */
export function tryClaim(
  ex: Executor,
  taskId: number,
  runId: number,
  agent: AgentName,
  now: number,
): ClaimResult {
  return ex.transaction((tx) => {
    const held = findActiveClaim(tx, taskId, now);
    if (held && held.runId !== runId) {
      return { claimed: false, heldBy: { runId: held.runId, agent: held.agent } };
    }
    const claim = { runId, agent, expiresAt: now + AGENT_LIMITS.claimTtlMs };
    tx.insert(agentClaims)
      .values({ taskId, ...claim })
      .onConflictDoUpdate({ target: agentClaims.taskId, set: claim })
      .run();
    recomputeAiState(tx, [taskId], now);
    return { claimed: true };
  });
}

/** Extends every claim the run holds to now + AGENT_LIMITS.claimTtlMs. */
export function renewClaims(ex: Executor, runId: number, now: number): void {
  ex.transaction((tx) => {
    const renewed = tx
      .update(agentClaims)
      .set({ expiresAt: now + AGENT_LIMITS.claimTtlMs })
      .where(eq(agentClaims.runId, runId))
      .returning({ taskId: agentClaims.taskId })
      .all();
    recomputeAiState(tx, taskIdsOf(renewed), now);
  });
}

export function releaseClaims(ex: Executor, runId: number, now: number): void {
  ex.transaction((tx) => {
    const released = tx
      .delete(agentClaims)
      .where(eq(agentClaims.runId, runId))
      .returning({ taskId: agentClaims.taskId })
      .all();
    recomputeAiState(tx, taskIdsOf(released), now);
  });
}

export function releaseTaskClaim(ex: Executor, taskId: number, runId: number, now: number): void {
  ex.transaction((tx) => {
    const released = tx
      .delete(agentClaims)
      .where(and(eq(agentClaims.taskId, taskId), eq(agentClaims.runId, runId)))
      .returning({ taskId: agentClaims.taskId })
      .all();
    recomputeAiState(tx, taskIdsOf(released), now);
  });
}

/** Deletes the claims of every run that is no longer running, such as runs a crash interrupted. */
export function deleteClaimsOfStoppedRuns(ex: Executor, now: number): void {
  ex.transaction((tx) => {
    const running = tx
      .select({ id: agentRuns.id })
      .from(agentRuns)
      .where(eq(agentRuns.status, "running"));
    const deleted = tx
      .delete(agentClaims)
      .where(notInArray(agentClaims.runId, running))
      .returning({ taskId: agentClaims.taskId })
      .all();
    recomputeAiState(tx, taskIdsOf(deleted), now);
  });
}
