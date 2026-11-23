import { describe, expect, it } from "vitest";
import { AgentError } from "../../src/agents/core/errors";
import type { Llm } from "../../src/agents/core/llm";
import { runAgent, type RunAgentParams } from "../../src/agents/core/runAgent";
import type { AgentTool } from "../../src/agents/core/tool";
import { createTraceRecorder } from "../../src/agents/core/trace";
import { noopRunTracer } from "../../src/agents/core/tracer";
import { anthropicLlm, anthropicMessage, toolUse, type WireRequest } from "./fakeProvider";
import { createTestTools } from "./helpers";

function loop(
  llm: Llm,
  extra: Partial<Pick<RunAgentParams<readonly AgentTool[]>, "tools" | "wallClockMs">> = {},
) {
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
