import type { AgentRun } from "@postdog/shared";
import { describe, expect, it } from "vitest";
import { ApiError } from "@/shared/api";
import { isRunBusy, toRunView } from "./run-view";

function run(status: AgentRun["status"]): AgentRun {
  return {
    id: 5,
    agent: "planner",
    mode: null,
    status,
    trigger: "manual",
    promptVersion: "PLANNER_PROMPT_V1",
    input: {},
    output: null,
    trace: [],
    error: null,
    langfuseTraceId: null,
    usage: null,
    llm: { mode: "mock", model: "mock" },
    startedAt: 1,
    finishedAt: status === "running" ? null : 2,
  };
}

describe("toRunView", () => {
  it("is starting from the click until the run first loads", () => {
    expect(toRunView({ kind: "starting" }, undefined, undefined).status).toBe("starting");
    expect(toRunView({ kind: "tracking", runId: 5 }, undefined, undefined).status).toBe("starting");
  });

  it.each(["running", "completed", "failed", "cancelled"] as const)(
    "follows the polled run once it is %s",
    (status) => {
      expect(toRunView({ kind: "tracking", runId: 5 }, run(status), undefined)).toEqual({
        status,
        run: run(status),
      });
    },
  );

  it("reports a failed start or a run that never loaded as a request failure", () => {
    const error = new ApiError(403, "ai_disabled", "AI is off.");
    expect(toRunView({ kind: "start_failed", error }, undefined, undefined)).toEqual({
      status: "request_failed",
      error,
    });
    expect(toRunView({ kind: "tracking", runId: 5 }, undefined, error)).toEqual({
      status: "request_failed",
      error,
    });
  });

  it("is busy only while starting or running", () => {
    expect(isRunBusy({ status: "starting" })).toBe(true);
    expect(isRunBusy({ status: "running", run: run("running") })).toBe(true);
    expect(isRunBusy({ status: "completed", run: run("completed") })).toBe(false);
    expect(isRunBusy({ status: "idle" })).toBe(false);
  });
});
