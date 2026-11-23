import { submitDailyPlanInputSchema, submitStatusUpdateInputSchema } from "@postdog/shared";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { AgentError } from "../../src/agents/core/errors";
import type { Llm } from "../../src/agents/core/llm";
import { runAgent, type RunAgentParams } from "../../src/agents/core/runAgent";
import { defineTerminalTool, type AgentTool } from "../../src/agents/core/tool";
import { createTraceRecorder } from "../../src/agents/core/trace";
import { noopRunTracer } from "../../src/agents/core/tracer";
import { proposeSubtasks, reportRelated } from "../../src/agents/decomposer/tools";
import { createApp } from "../../src/app";
import { addTask, createTestDb } from "../suggestionFixtures";
import {
  anthropicLlm,
  anthropicMessage,
  functionCall,
  openaiLlm,
  openaiResponse,
  toolUse,
  type WireRequest,
} from "./fakeProvider";
import { createTestTools, waitForRun } from "./helpers";

const terminal = <S extends z.ZodType>(name: string, input: S) =>
  defineTerminalTool({ name, description: `Submit ${name}.`, input });

type LoopOptions = Partial<
  Pick<RunAgentParams<readonly AgentTool[]>, "tools" | "wallClockMs" | "maxOutputTokens">
>;

function loop(llm: Llm, extra: LoopOptions = {}) {
  const trace = createTraceRecorder();
  const result = runAgent({
    signal: new AbortController().signal,
    trace,
    llm,
    tracer: noopRunTracer,
    name: "wire",
    system: "You are a test agent.",
    userMessage: "Find item 1.",
    tools: extra.tools ?? createTestTools().tools,
    wallClockMs: extra.wallClockMs,
    maxOutputTokens: extra.maxOutputTokens,
  });
  return { result, trace };
}

async function failure(promise: Promise<unknown>): Promise<AgentError> {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AgentError);
  return err as AgentError;
}

/** The tool_result blocks the provider received in its last request, in order. */
function lastToolResults(requests: readonly WireRequest[]) {
  const messages = requests.at(-1)!.messages as { role: string; content: unknown }[];
  const last = messages.at(-1)!;
  expect(last.role).toBe("user");
  return last.content as { tool_use_id: string; content: string; is_error?: boolean }[];
}

describe("runAgent on the Anthropic wire format", () => {
  it("answers every parallel tool_use with a tool_result, an unknown tool included", async () => {
    const lookup = toolUse("lookup", { id: 1 });
    const unknown = toolUse("create_task", { title: "x" });
    const { llm, requests } = anthropicLlm([
      anthropicMessage([{ type: "text", text: "Let me look." }, lookup, unknown]),
      anthropicMessage([toolUse("finish", { answer: "item 1" })]),
    ]);

    await expect(loop(llm).result).resolves.toMatchObject({ toolName: "finish", steps: 2 });
    expect(lastToolResults(requests)).toEqual([
      { type: "tool_result", tool_use_id: lookup.id, content: '{"id":1,"name":"item 1"}' },
      {
        type: "tool_result",
        tool_use_id: unknown.id,
        content: 'Unknown tool "create_task". Use one of: lookup, finish.',
        is_error: true,
      },
    ]);
  });

  it("lets the model correct a step whose parallel calls were all invalid", async () => {
    const { llm, requests } = anthropicLlm([
      anthropicMessage([toolUse("lookup", { id: "PD-1" }), toolUse("lookup", { id: "PD-2" })]),
      anthropicMessage([toolUse("finish", { answer: "item 1" })]),
    ]);

    await expect(loop(llm).result).resolves.toMatchObject({ toolName: "finish", steps: 2 });
    expect(lastToolResults(requests).map((r) => r.is_error)).toEqual([true, true]);
  });

  it("fails with validation_failed after two steps in a row with only invalid calls", async () => {
    const { llm, requests } = anthropicLlm([
      anthropicMessage([toolUse("lookup", { id: "PD-1" }), toolUse("lookup", { id: "PD-2" })]),
      anthropicMessage([toolUse("finish", { answer: "" })]),
    ]);

    const err = await failure(loop(llm).result);
    expect(err.code).toBe("validation_failed");
    expect(err.message).toMatch(/^The model sent only invalid tool calls in 2 steps in a row\./);
    expect(requests).toHaveLength(2);
  });

  it("starts the count again after a step with one valid call", async () => {
    const { llm } = anthropicLlm([
      anthropicMessage([toolUse("lookup", { id: "PD-1" })]),
      anthropicMessage([toolUse("lookup", { id: 2 }), toolUse("lookup", { id: "PD-3" })]),
      anthropicMessage([toolUse("nope", {})]),
      anthropicMessage([toolUse("finish", { answer: "item 2" })]),
    ]);

    await expect(loop(llm).result).resolves.toMatchObject({ steps: 4 });
  });
});

describe("an answer cut off at the output limit", () => {
  it("sends the loop's cap, 4,096 tokens by default", async () => {
    const finish = anthropicMessage([toolUse("finish", { answer: "item 1" })]);
    const byDefault = anthropicLlm([finish]);
    await loop(byDefault.llm).result;
    const raised = anthropicLlm([finish]);
    await loop(raised.llm, { maxOutputTokens: 8192 }).result;
    expect([byDefault.requests[0]!.max_tokens, raised.requests[0]!.max_tokens]).toEqual([
      4096, 8192,
    ]);
  });

  for (const [what, content] of [
    ["in text", [{ type: "text", text: "Here is a very long plan" }]],
    ["inside a tool call", [toolUse("finish", {})]],
  ] as const) {
    it(`fails at once with llm_error and says so, when it is cut ${what}`, async () => {
      const { llm, requests } = anthropicLlm([anthropicMessage([...content], "max_tokens", 4096)]);

      const err = await failure(loop(llm).result);
      expect(err.code).toBe("llm_error");
      expect(err.message).toBe(
        "The model's answer was cut off at 4096 tokens, the output limit of one step.",
      );
      expect(requests).toHaveLength(1);
    });
  }

  it("gives the Decomposer's task loop 8,192 tokens, room for 8 subtasks", async () => {
    const db = createTestDb();
    const task = addTask(db, { title: "Add SSO" });
    const { llm, requests } = anthropicLlm([
      anthropicMessage([
        toolUse("skip", { reason: "already_atomic", explanation: "One config change." }),
      ]),
    ]);
    const api = request(createApp(db, { llm }));

    const res = await api
      .post("/api/agents/decomposer/run")
      .send({ taskIds: [task.id] })
      .expect(202);
    expect((await waitForRun(api, res.body.runId as number)).status).toBe("completed");
    expect(requests.map((r) => r.max_tokens)).toEqual([8192]);
  });
});

describe("a nested field sent as a JSON string", () => {
  const plan = { focus: [{ taskId: 3, reason: "Stale for 8 days.", signals: ["stale"] }] };
  const split = {
    subtasks: [
      { title: "Add the middleware", description: "Count per key." },
      { title: "Answer 429", description: "" },
    ],
    rationale: "[WIP] middleware first, then the contract.",
  };
  const groups = { groups: [{ relation: "overlaps", taskIds: [9, 19], reason: "Same API." }] };
  const update = {
    tone: "neutral",
    toneReason: "Work is moving.",
    headline: "[Q3] CSV export is halfway",
    done: [{ taskId: 19, text: "Endpoint shipped" }],
    inProgress: [],
    blockers: [{ taskId: 15, text: "Waiting on design", ask: "Ana to review" }],
    next: ["Wire up the download"],
  };
  const stringified = (value: Record<string, unknown>, keys: string[]) =>
    Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, keys.includes(k) ? JSON.stringify(v) : v]),
    );

  for (const [tool, input, keys] of [
    [terminal("submit_daily_plan", submitDailyPlanInputSchema), plan, ["focus"]],
    [proposeSubtasks, split, ["subtasks"]],
    [reportRelated, groups, ["groups"]],
    [
      terminal("submit_status_update", submitStatusUpdateInputSchema),
      update,
      ["done", "inProgress", "blockers", "next"],
    ],
  ] as const) {
    it(`parses ${tool.name}.${keys.join(", ")} back, and leaves real strings alone`, async () => {
      const { llm } = anthropicLlm([
        anthropicMessage([toolUse(tool.name, stringified(input, [...keys]))]),
      ]);
      const { output } = await loop(llm, { tools: [tool] }).result;
      expect(output).toEqual(tool.input.parse(input));
    });
  }

  it("leaves a string that is not JSON to the schema's error", async () => {
    const { llm, requests } = anthropicLlm([
      anthropicMessage([toolUse("propose_subtasks", { ...split, subtasks: "[oops" })]),
      anthropicMessage([toolUse("propose_subtasks", split)]),
    ]);
    await expect(loop(llm, { tools: [proposeSubtasks] }).result).resolves.toMatchObject({
      steps: 2,
    });
    expect(lastToolResults(requests)[0]!.content).toMatch(
      /^Invalid input for propose_subtasks: subtasks: Invalid input: expected array, received string/,
    );
  });
});

describe("tool arguments that are not valid JSON (OpenAI)", () => {
  it("tells the model to send a JSON object, and lets it correct the call", async () => {
    const broken = functionCall("lookup", '{"id":');
    const { llm, requests } = openaiLlm([
      openaiResponse([broken]),
      openaiResponse([functionCall("finish", '{"answer":"item 1"}')]),
    ]);

    await expect(loop(llm).result).resolves.toMatchObject({ toolName: "finish", steps: 2 });
    const outputs = (requests[1]!.input as { type: string; call_id?: string; output?: string }[])
      .filter((item) => item.type === "function_call_output")
      .map((item) => [item.call_id, item.output]);
    expect(outputs).toEqual([
      [
        broken.call_id,
        JSON.stringify({ error: "Your arguments were not valid JSON; send a JSON object." }),
      ],
    ]);
  });
});
