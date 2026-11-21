import { describe, expect, it } from "vitest";
import {
  agentRunSchema,
  agentRunSummarySchema,
  getTaskNotesInputSchema,
  listAgentRunsQuerySchema,
  searchTasksInputSchema,
} from "@postdog/shared";

const run = {
  id: 7,
  agent: "planner",
  mode: null,
  status: "failed",
  promptVersion: "PLANNER_PROMPT_V1",
  input: {},
  output: null,
  trace: [
    {
      step: 1,
      type: "tool",
      tool: "get_task",
      input: '{"id":12}',
      outputSummary: "PD-12 Fix login",
      durationMs: 4,
    },
    {
      step: 2,
      type: "llm",
      input: "…",
      outputSummary: "called submit_daily_plan",
      durationMs: 900,
      tokens: { input: 1200, output: 80 },
    },
  ],
  error: { code: "step_limit", message: "Stopped after 8 steps" },
  langfuseTraceId: null,
  usage: { inputTokens: 1200, outputTokens: 80 },
  llm: { mode: "mock", model: "mock:planner" },
  startedAt: 1_700_000_000_000,
  finishedAt: 1_700_000_001_000,
};

describe("agentRunSchema", () => {
  it("accepts a failed run with its trace", () => {
    expect(agentRunSchema.parse(run)).toEqual(run);
  });

  it("accepts a running run with no output, usage or finish time", () => {
    const running = { ...run, status: "running", error: null, usage: null, finishedAt: null };
    expect(agentRunSchema.safeParse(running).success).toBe(true);
  });

  it("rejects an unknown agent, status or error code", () => {
    expect(agentRunSchema.safeParse({ ...run, agent: "writer" }).success).toBe(false);
    expect(agentRunSchema.safeParse({ ...run, status: "queued" }).success).toBe(false);
    expect(
      agentRunSchema.safeParse({ ...run, error: { code: "agent_failed", message: "m" } }).success,
    ).toBe(false);
  });

  it("leaves input, output and trace out of the summary", () => {
    expect(agentRunSummarySchema.parse(run)).not.toHaveProperty("trace");
    expect(agentRunSummarySchema.parse(run)).not.toHaveProperty("input");
    expect(agentRunSummarySchema.parse(run)).not.toHaveProperty("output");
  });
});

describe("listAgentRunsQuerySchema", () => {
  it("defaults the limit to 20", () => {
    expect(listAgentRunsQuerySchema.parse({})).toEqual({ limit: 20 });
  });

  it("coerces a string limit and filters", () => {
    expect(
      listAgentRunsQuerySchema.parse({ agent: "status_updater", status: "completed", limit: "5" }),
    ).toEqual({ agent: "status_updater", status: "completed", limit: 5 });
  });

  it("accepts a limit of 100 and rejects 0 and 101", () => {
    expect(listAgentRunsQuerySchema.safeParse({ limit: "100" }).success).toBe(true);
    expect(listAgentRunsQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(listAgentRunsQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
  });
});

describe("read tool inputs", () => {
  it("defaults the search limit to 10 and caps it at 50", () => {
    expect(searchTasksInputSchema.parse({ query: " login " })).toEqual({
      query: "login",
      limit: 10,
    });
    expect(searchTasksInputSchema.safeParse({ query: "a", limit: 50 }).success).toBe(true);
    expect(searchTasksInputSchema.safeParse({ query: "a", limit: 51 }).success).toBe(false);
  });

  it("rejects an empty or 101-character search query", () => {
    expect(searchTasksInputSchema.safeParse({ query: "  " }).success).toBe(false);
    expect(searchTasksInputSchema.safeParse({ query: "a".repeat(101) }).success).toBe(false);
  });

  it("defaults the notes limit to 20 and caps it at 50", () => {
    expect(getTaskNotesInputSchema.parse({ taskId: 3 })).toEqual({ taskId: 3, limit: 20 });
    expect(getTaskNotesInputSchema.safeParse({ taskId: 3, limit: 51 }).success).toBe(false);
  });
});
