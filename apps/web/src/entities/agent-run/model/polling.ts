import type { AgentRun } from "@postdog/shared";

export const RUN_POLL_INTERVAL_MS = 1500;

/**
 * How often to refetch a run: while it is running, and never once it has settled.
 * An unloaded run is not polled; its first fetch starts the polling.
 */
export function runPollInterval(run: Pick<AgentRun, "status"> | undefined): number {
  return run?.status === "running" ? RUN_POLL_INTERVAL_MS : 0;
}
