import type { AgentRun } from "@postdog/shared";

/** What the client knows about one AI action before the run itself loads. */
export type RunnerState =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "tracking"; runId: number }
  | { kind: "start_failed"; error: unknown };

/**
 * The UX state of one AI action: idle, then starting and running, then one of the settled
 * states. request_failed means the API never gave us a run to show: the start or the first
 * fetch of the run failed.
 */
export type RunView<Run extends AgentRun = AgentRun> =
  | { status: "idle" }
  | { status: "starting" }
  | { status: "running"; run: Run }
  | { status: "completed"; run: Run }
  | { status: "failed"; run: Run }
  | { status: "cancelled"; run: Run }
  | { status: "request_failed"; error: unknown };

export function toRunView<Run extends AgentRun>(
  state: RunnerState,
  run: Run | undefined,
  runError: unknown,
): RunView<Run> {
  switch (state.kind) {
    case "idle":
    case "starting":
      return { status: state.kind };
    case "start_failed":
      return { status: "request_failed", error: state.error };
    case "tracking":
      if (run) return { status: run.status, run };
      return runError ? { status: "request_failed", error: runError } : { status: "starting" };
  }
}

export function isRunBusy(view: RunView): boolean {
  return view.status === "starting" || view.status === "running";
}
