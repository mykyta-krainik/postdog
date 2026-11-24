import { describe, expect, it } from "vitest";
import {
  agentRunSchema,
  plannerLatestResponseSchema,
  plannerRunSchema,
  submitDailyPlanInputSchema,
} from "@postdog/shared";

const focusItem = { taskId: 12, reason: "Stale in progress work", signals: ["in progress 6 days"] };

describe("submitDailyPlanInputSchema", () => {
  it("defaults warnings and coordination notes to empty lists", () => {
    expect(submitDailyPlanInputSchema.parse({ focus: [focusItem] })).toEqual({
      focus: [focusItem],
      warnings: [],
      coordinationNotes: [],
    });
  });

  it("accepts 1 to 5 focus items and rejects 0 and 6", () => {
    const focus = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ ...focusItem, taskId: i + 1 }));
    expect(submitDailyPlanInputSchema.safeParse({ focus: focus(5) }).success).toBe(true);
    expect(submitDailyPlanInputSchema.safeParse({ focus: focus(0) }).success).toBe(false);
    expect(submitDailyPlanInputSchema.safeParse({ focus: focus(6) }).success).toBe(false);
  });

  it("bounds the reason to 1..300 characters after trimming", () => {
    const parse = (reason: string) =>
      submitDailyPlanInputSchema.safeParse({ focus: [{ ...focusItem, reason }] }).success;
    expect(parse("a".repeat(300))).toBe(true);
    expect(parse("a".repeat(301))).toBe(false);
    expect(parse("   ")).toBe(false);
  });

  it("allows up to 5 signals of at most 60 characters", () => {
    const parse = (signals: string[]) =>
      submitDailyPlanInputSchema.safeParse({ focus: [{ ...focusItem, signals }] }).success;
    expect(parse([])).toBe(true);
    expect(parse(["a".repeat(60), "b", "c", "d", "e"])).toBe(true);
    expect(parse(["a", "b", "c", "d", "e", "f"])).toBe(false);
    expect(parse(["a".repeat(61)])).toBe(false);
  });

  it("accepts a warning with or without a task id", () => {
    const warnings = [{ message: "Nothing is in progress" }, { taskId: 3, message: "Blocked" }];
    expect(submitDailyPlanInputSchema.parse({ focus: [focusItem], warnings }).warnings).toEqual(
      warnings,
    );
  });
});

const output = {
  focus: [{ ...focusItem, identifier: "PD-12", title: "Fix login" }],
  warnings: [{ taskId: 4, message: "PD-4 is done, dropped it from the plan" }],
  coordinationNotes: [],
};

const completedRun = {
  id: 9,
  agent: "planner",
  mode: null,
  status: "completed",
  trigger: "scheduled",
  promptVersion: "PLANNER_PROMPT_V1",
  input: {},
  output,
  trace: [],
  error: null,
  langfuseTraceId: null,
  usage: { inputTokens: 900, outputTokens: 120 },
  llm: { mode: "mock", model: "mock" },
  startedAt: 1_700_000_000_000,
  finishedAt: 1_700_000_002_000,
};

describe("plannerRunSchema", () => {
  it("types the output of a completed planner run", () => {
    const run = plannerRunSchema.parse(agentRunSchema.parse(completedRun));
    expect(run.output?.focus[0]?.identifier).toBe("PD-12");
  });

  it("accepts a running run with no output", () => {
    const running = { ...completedRun, status: "running", output: null, finishedAt: null };
    expect(plannerRunSchema.safeParse(running).success).toBe(true);
  });

  it("rejects another agent's run and a focus item without its identifier", () => {
    expect(plannerRunSchema.safeParse({ ...completedRun, agent: "status_updater" }).success).toBe(
      false,
    );
    const bare = { ...output, focus: [focusItem] };
    expect(plannerRunSchema.safeParse({ ...completedRun, output: bare }).success).toBe(false);
  });
});

describe("plannerLatestResponseSchema", () => {
  it("accepts no plan yet", () => {
    expect(plannerLatestResponseSchema.parse({ latest: null })).toEqual({ latest: null });
  });

  it("accepts the latest completed run with its change count", () => {
    const body = { latest: { run: completedRun, changedSince: 3 } };
    expect(plannerLatestResponseSchema.parse(body)).toEqual(body);
  });

  it("rejects a run that is not completed", () => {
    const failed = { ...completedRun, status: "failed", output: null };
    expect(
      plannerLatestResponseSchema.safeParse({ latest: { run: failed, changedSince: 0 } }).success,
    ).toBe(false);
  });
});
