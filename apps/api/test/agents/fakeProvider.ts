import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { Llm } from "../../src/agents/core/llm";

/**
 * The real @ai-sdk providers on a fake fetch, so the loop is tested against the providers'
 * own wire formats (tool_use blocks, stop reasons, HTTP errors) without an API key.
 */
export interface FakeReply {
  status?: number;
  headers?: Record<string, string>;
  body: unknown;
}

export type WireRequest = Record<string, unknown> & { messages?: unknown[]; input?: unknown[] };

export const FAKE_API_KEY = "sk-test-SECRET-KEY-0123456789";

/** Answers each request with the next reply; the last reply repeats. */
function fakeFetch(replies: readonly FakeReply[]) {
  const requests: WireRequest[] = [];
  const fetch = async (_url: unknown, init?: RequestInit) => {
    requests.push(JSON.parse(String(init?.body)) as WireRequest);
    const reply = replies[Math.min(requests.length, replies.length) - 1]!;
    return new Response(JSON.stringify(reply.body), {
      status: reply.status ?? 200,
      headers: { "content-type": "application/json", ...reply.headers },
    });
  };
  return { fetch: fetch as typeof globalThis.fetch, requests };
}

export function anthropicLlm(replies: readonly FakeReply[]) {
  const { fetch, requests } = fakeFetch(replies);
  const provider = createAnthropic({ apiKey: FAKE_API_KEY, fetch });
  const llm: Llm = {
    info: { mode: "real", model: "anthropic:claude-test" },
    model: () => provider("claude-test"),
  };
  return { llm, requests };
}

export function openaiLlm(replies: readonly FakeReply[]) {
  const { fetch, requests } = fakeFetch(replies);
  const provider = createOpenAI({ apiKey: FAKE_API_KEY, fetch });
  const llm: Llm = {
    info: { mode: "real", model: "openai:gpt-test" },
    model: () => provider("gpt-test"),
  };
  return { llm, requests };
}

let toolUseCount = 0;

export function toolUse(name: string, input: unknown) {
  return { type: "tool_use", id: `toolu_${++toolUseCount}`, name, input };
}

/** An Anthropic Messages API reply. stopReason "max_tokens" is a cut-off answer. */
export function anthropicMessage(
  content: unknown[],
  stopReason = "tool_use",
  outputTokens = 20,
): FakeReply {
  return {
    body: {
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: "claude-test",
      content,
      stop_reason: stopReason,
      stop_sequence: null,
      usage: { input_tokens: 100, output_tokens: outputTokens },
    },
  };
}

export function anthropicError(status: number, type: string, message: string): FakeReply {
  return { status, body: { type: "error", error: { type, message } } };
}

export function functionCall(name: string, args: string) {
  const id = `call_${++toolUseCount}`;
  return { type: "function_call", id: `fc_${id}`, call_id: id, name, arguments: args };
}

/** An OpenAI Responses API reply. `args` is the raw arguments string, valid JSON or not. */
export function openaiResponse(output: unknown[]): FakeReply {
  return {
    body: {
      id: "resp_test",
      object: "response",
      created_at: 1,
      model: "gpt-test",
      status: "completed",
      output: output.map((item) => ({ status: "completed", ...(item as object) })),
      usage: {
        input_tokens: 100,
        output_tokens: 20,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens_details: { reasoning_tokens: 0 },
      },
    },
  };
}
