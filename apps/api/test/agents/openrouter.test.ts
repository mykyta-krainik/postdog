import { describe, expect, it } from "vitest";
import { createLlm, mockLlm } from "../../src/agents/core/llm";
import { runAgent } from "../../src/agents/core/runAgent";
import { defineTerminalTool } from "../../src/agents/core/tool";
import { z } from "zod";
import { FAKE_API_KEY } from "./fakeProvider";
import { createTraceRecorder } from "../../src/agents/core/trace";
import { noopRunTracer } from "../../src/agents/core/tracer";

const MODEL = "openrouter:meta-llama/llama-3.3-70b-instruct:free";

function chatCompletion(toolName: string, args: unknown) {
  return {
    id: "gen-test",
    object: "chat.completion",
    created: 1,
    model: "meta-llama/llama-3.3-70b-instruct:free",
    choices: [
      {
        index: 0,
        finish_reason: "tool_calls",
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: toolName, arguments: JSON.stringify(args) },
            },
          ],
        },
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
  };
}

describe("the openrouter provider", () => {
  it("calls OpenRouter's chat completions with the key and the full model id, and gets a tool call back", async () => {
    const calls: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
    const fetch = (async (url: unknown, init?: RequestInit) => {
      calls.push({
        url: String(url),
        headers: new Headers(init?.headers),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });
      return new Response(JSON.stringify(chatCompletion("finish", { answer: "done" })), {
        headers: { "content-type": "application/json" },
      });
    }) as typeof globalThis.fetch;

    const llm = createLlm(
      { LLM_MOCK: false, LLM_MODEL: MODEL, OPENROUTER_API_KEY: FAKE_API_KEY },
      { fetch },
    );
    expect(llm.info).toEqual({ mode: "real", model: MODEL });

    const finish = defineTerminalTool({
      name: "finish",
      description: "Finish.",
      input: z.object({ answer: z.string() }),
    });
    const result = await runAgent({
      name: "wire",
      system: "You plan.",
      userMessage: "Go.",
      tools: [finish],
      signal: new AbortController().signal,
      trace: createTraceRecorder(),
      llm,
      tracer: noopRunTracer,
    });

    expect(result).toMatchObject({ toolName: "finish", output: { answer: "done" } });
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(call.headers.get("authorization")).toBe(`Bearer ${FAKE_API_KEY}`);
    expect(call.body.model).toBe("meta-llama/llama-3.3-70b-instruct:free");
    expect(call.body.tools).toEqual([
      expect.objectContaining({
        type: "function",
        function: expect.objectContaining({ name: "finish" }),
      }),
    ]);
  });

  it("falls back to the mock when the OpenRouter key is missing, like the other providers", () => {
    expect(createLlm({ LLM_MOCK: false, LLM_MODEL: MODEL })).toBe(mockLlm);
    expect(createLlm({ LLM_MOCK: true, LLM_MODEL: MODEL, OPENROUTER_API_KEY: "k" })).toBe(mockLlm);
  });
});
