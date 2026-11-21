import { describe, expect, it } from "vitest";
import { AgentError } from "../../src/agents/core/errors";
import type { MockConversation } from "../../src/agents/core/llm";
import { runAgent } from "../../src/agents/core/runAgent";
import { call, createTestTools, hang, loopDeps, script } from "./helpers";

function loop(
  name: string,
  extra: { signal?: AbortSignal; maxSteps?: number; wallClockMs?: number } = {},
) {
  const { tools, ran } = createTestTools();
  const deps = loopDeps(extra.signal);
  const result = runAgent({
    ...deps,
    name,
    system: "You are a test agent.",
    userMessage: "Find item 1.",
    tools,
    maxSteps: extra.maxSteps,
    wallClockMs: extra.wallClockMs,
  });
  return { result, ran, trace: deps.trace };
}

async function failure(promise: Promise<unknown>): Promise<AgentError> {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AgentError);
  return err as AgentError;
}

function lastUserText(conversation: MockConversation): string {
  const last = conversation.prompt.at(-1);
  if (last?.role !== "user") return "";
  return last.content.map((part) => (part.type === "text" ? part.text : "")).join("");
}

describe("runAgent", () => {
  it("runs read tools and returns the terminal tool's validated input", async () => {
    const { name, seen } = script([
      call("lookup", { id: 1 }),
      call("finish", { answer: "item 1" }),
    ]);
    const { result, ran, trace } = loop(name);

    await expect(result).resolves.toEqual({
      toolName: "finish",
      output: { answer: "item 1" },
      steps: 2,
    });
    expect(ran).toEqual([1]);
    expect(seen[0]!.userMessage).toBe("Find item 1.");
    expect(seen[0]!.system).toBe("You are a test agent.");
    expect(seen[1]!.lastResults).toEqual([
      { toolName: "lookup", input: { id: 1 }, output: { id: 1, name: "item 1" }, isError: false },
    ]);
    const steps = trace.steps();
    expect(steps.map((s) => [s.step, s.type, s.tool])).toEqual([
      [1, "llm", undefined],
      [2, "tool", "lookup"],
      [3, "llm", undefined],
      [4, "tool", "finish"],
    ]);
    expect(steps[1]!.outputSummary).toBe("item 1");
    expect(steps[0]!.tokens!.input).toBeGreaterThan(0);
    expect(trace.usage().inputTokens).toBe(steps[0]!.tokens!.input + steps[2]!.tokens!.input);
  });

  it("returns invalid input as an error result and lets the model correct it", async () => {
    const { name, seen } = script([
      call("lookup", { id: -1 }),
      call("lookup", { id: 2 }),
      call("finish", { answer: "item 2" }),
    ]);
    const { result, ran, trace } = loop(name);

    await expect(result).resolves.toMatchObject({ output: { answer: "item 2" }, steps: 3 });
    expect(ran).toEqual([2]);
    const [error] = seen[1]!.lastResults;
    expect(error!.isError).toBe(true);
    expect(error!.output).toMatch(/^Invalid input for lookup: id: .+Fix the input/);
    expect(trace.steps().filter((s) => s.type === "validation")).toHaveLength(1);
  });

  it("answers an unknown tool with the list of valid tools", async () => {
    const { name, seen } = script([call("delete_everything"), call("finish", { answer: "ok" })]);
    await expect(loop(name).result).resolves.toMatchObject({ toolName: "finish" });
    expect(seen[1]!.lastResults[0]).toMatchObject({
      isError: true,
      output: 'Unknown tool "delete_everything". Use one of: lookup, finish.',
    });
  });

  it("sends a tool's own error to the model without counting it as invalid input", async () => {
    const { name, seen } = script([
      call("lookup", { id: 404 }),
      call("lookup", { id: -1 }),
      call("finish", { answer: "none" }),
    ]);
    await expect(loop(name).result).resolves.toMatchObject({ steps: 3 });
    expect(seen[1]!.lastResults[0]).toMatchObject({
      isError: true,
      output: "Item 404 not found. Use lookup with an id from the list.",
    });
  });

  it("fails with step_limit after maxSteps and keeps the trace so far", async () => {
    const { name } = script([(c) => call("lookup", { id: c.turn })]);
    const { result, trace, ran } = loop(name, { maxSteps: 3 });

    const err = await failure(result);
    expect(err.code).toBe("step_limit");
    expect(ran).toEqual([1, 2, 3]);
    expect(trace.steps().filter((s) => s.type === "llm")).toHaveLength(3);
  });

  it("nudges once after a reply without a tool call", async () => {
    const { name, seen } = script([
      { text: "Item 1 is a thing." },
      call("finish", { answer: "1" }),
    ]);
    await expect(loop(name).result).resolves.toMatchObject({ output: { answer: "1" } });
    expect(lastUserText(seen[1]!)).toBe("Finish by calling one of: finish.");
  });

  it("fails with no_terminal_tool after a second reply without a tool call", async () => {
    const { name } = script([{ text: "Hmm." }, { text: "Still thinking." }]);
    const err = await failure(loop(name).result);
    expect(err.code).toBe("no_terminal_tool");
    expect(err.message).toContain("finish");
  });

  it("fails with validation_failed after two invalid calls in a row", async () => {
    const { name } = script([call("lookup", { id: "one" }), call("nope")]);
    const { result, trace } = loop(name);
    const err = await failure(result);
    expect(err.code).toBe("validation_failed");
    expect(trace.steps().filter((s) => s.type === "validation")).toHaveLength(2);
  });

  it("returns the cached result with a note when a call repeats its input", async () => {
    const { name, seen } = script([
      call("lookup", { id: 7 }),
      call("lookup", { id: 7 }),
      call("finish", { answer: "7" }),
    ]);
    const { result, ran } = loop(name);
    await expect(result).resolves.toMatchObject({ steps: 3 });
    expect(ran).toEqual([7]);
    expect(seen[2]!.lastResults[0]!.output).toEqual({
      note: expect.stringContaining("already called this tool with this exact input"),
      result: { id: 7, name: "item 7" },
    });
  });

  it("pairs every tool call with a tool result in the history", async () => {
    const { name, seen } = script([
      {
        toolCalls: [
          { toolName: "lookup", input: { id: 1 } },
          { toolName: "lookup", input: { id: 0 } },
          { toolName: "unknown_tool", input: {} },
          { toolName: "lookup", input: { id: 2 } },
        ],
      },
      call("lookup", { id: 3 }),
      call("finish", { answer: "done" }),
    ]);
    await expect(loop(name).result).resolves.toMatchObject({ steps: 3 });

    const { prompt } = seen[2]!;
    prompt.forEach((message, i) => {
      if (message.role !== "assistant") return;
      const callIds = message.content.flatMap((p) =>
        p.type === "tool-call" ? [p.toolCallId] : [],
      );
      const next = prompt[i + 1];
      const resultIds =
        next?.role === "tool"
          ? next.content.flatMap((p) => (p.type === "tool-result" ? [p.toolCallId] : []))
          : [];
      expect(resultIds).toEqual(callIds);
    });
    expect(seen[1]!.lastResults.map((r) => r.isError)).toEqual([false, true, true, false]);
  });

  it("ends with cancelled when the signal aborts", async () => {
    const controller = new AbortController();
    const { name } = script([hang]);
    const { result } = loop(name, { signal: controller.signal });
    setTimeout(() => controller.abort(), 20);
    expect((await failure(result)).code).toBe("cancelled");
  });

  it("ends with the abort reason when it is an AgentError", async () => {
    const controller = new AbortController();
    controller.abort(new AgentError("ai_disabled", "AI was turned off in Settings."));
    const { name } = script([call("finish", { answer: "x" })]);
    expect((await failure(loop(name, { signal: controller.signal }).result)).code).toBe(
      "ai_disabled",
    );
  });

  it("ends with timeout when one loop exceeds its wall clock", async () => {
    const { name } = script([hang]);
    const err = await failure(loop(name, { wallClockMs: 50 }).result);
    expect(err.code).toBe("timeout");
  });

  it("fails with llm_error when the model call throws", async () => {
    const err = await failure(loop("agent_without_a_script").result);
    expect(err.code).toBe("llm_error");
    expect(err.message).toContain('No mock script is registered for "agent_without_a_script"');
  });
});
