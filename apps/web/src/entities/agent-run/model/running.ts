import type { AgentRunSummary } from "@postdog/shared";

/**
 * What a new run would collide with, as the API's run slots define it: one Planner run, one
 * Decomposer batch, and one Status updater run per scope. A start in a taken slot answers 409.
 * `taskIdentifier` is the task of a task-scoped update, null for "My update".
 */
export type RunSlot =
  | { agent: "planner" }
  | { agent: "decomposer" }
  | { agent: "status_updater"; taskIdentifier: string | null };

/**
 * A summary carries no input, so the scope is read from its label. These mirror the API's
 * runLabel: "Answer a clarification" runs have their own slot, and an update names its task.
 */
export const CLARIFY_RUN_LABEL = "Answer a clarification";

export function statusUpdateRunLabel(taskIdentifier: string | null): string {
  return taskIdentifier === null ? "My status update" : `Status update for ${taskIdentifier}`;
}

function inSlot(run: Pick<AgentRunSummary, "agent" | "label">, slot: RunSlot): boolean {
  if (run.agent !== slot.agent) return false;
  switch (slot.agent) {
    case "planner":
      return true;
    case "decomposer":
      return run.label !== CLARIFY_RUN_LABEL;
    case "status_updater":
      return run.label === statusUpdateRunLabel(slot.taskIdentifier);
  }
}

/**
 * The running run in a slot, so an entry point can link to it instead of starting a second one.
 * `exceptId` leaves out the caller's own run, which it already shows.
 */
export function findRunning<Run extends Pick<AgentRunSummary, "id" | "agent" | "label" | "status">>(
  runs: readonly Run[] | undefined,
  slot: RunSlot,
  exceptId?: number,
): Run | undefined {
  return runs?.find((run) => run.status === "running" && run.id !== exceptId && inSlot(run, slot));
}

export const RUNNING_POLL_MS = { active: 2000, idle: 15_000 } as const;

/** How often to ask which runs are running: fast while some are, slowly to notice new ones. */
export function runningPollInterval(data: { items: readonly unknown[] } | undefined): number {
  return data && data.items.length > 0 ? RUNNING_POLL_MS.active : RUNNING_POLL_MS.idle;
}

/** The runs that were running before and are not now: they completed, failed or were cancelled. */
export function settledRunIds(previous: readonly number[], current: readonly number[]): number[] {
  return previous.filter((id) => !current.includes(id));
}
