import request from "supertest";
import { describe, expect, it } from "vitest";
import { AgentError } from "../../src/agents/core/errors";
import type { Llm } from "../../src/agents/core/llm";
import { runAgent, type RunAgentParams } from "../../src/agents/core/runAgent";
import type { AgentTool } from "../../src/agents/core/tool";
import { createTraceRecorder } from "../../src/agents/core/trace";
import { noopRunTracer } from "../../src/agents/core/tracer";
import { createApp } from "../../src/app";
import { addTask, createTestDb } from "../suggestionFixtures";
import { anthropicLlm, anthropicMessage, toolUse, type WireRequest } from "./fakeProvider";
import { createTestTools, waitForRun } from "./helpers";

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
