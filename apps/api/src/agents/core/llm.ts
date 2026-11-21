import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LlmInfo } from "@postdog/shared";
import { createProviderRegistry, type LanguageModel } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import type { Env, LlmProvider } from "../../config/env";

export interface Llm {
  readonly info: LlmInfo;
  model(agentName: string): LanguageModel;
}

export interface MockToolResult {
  toolName: string;
  input: unknown;
  output: unknown;
  isError: boolean;
}

export interface MockConversation {
  agentName: string;
  system: string;
  userMessage: string;
  turn: number;
  results: MockToolResult[];
  lastResults: MockToolResult[];
  prompt: CallOptions["prompt"];
}

export interface MockToolCall {
  toolName: string;
  input: unknown;
}

export type MockTurn = { toolCalls: MockToolCall[] } | { text: string };

export type MockScript = (conversation: MockConversation) => MockTurn | Promise<MockTurn>;

type CallOptions = Parameters<MockLanguageModelV4["doGenerate"]>[0];
type GenerateResult = Awaited<ReturnType<MockLanguageModelV4["doGenerate"]>>;

const mockScripts = new Map<string, MockScript>();

export function registerMockScript(agentName: string, script: MockScript): void {
  mockScripts.set(agentName, script);
}

const API_KEY_ENV = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
} as const satisfies Record<LlmProvider, keyof Env>;

type LlmEnv = Pick<Env, "LLM_MOCK" | "LLM_MODEL" | (typeof API_KEY_ENV)[LlmProvider]>;

export const mockLlm: Llm = {
  info: { mode: "mock", model: "mock" },
  model: (agentName) =>
    new MockLanguageModelV4({
      provider: "mock",
      modelId: agentName,
      doGenerate: (options) => replayMockScript(agentName, options),
    }),
};

export function createLlm(env: LlmEnv): Llm {
  const provider = env.LLM_MODEL.slice(0, env.LLM_MODEL.indexOf(":")) as LlmProvider;
  if (env.LLM_MOCK || !env[API_KEY_ENV[provider]]) return mockLlm;

  const registry = createProviderRegistry({
    anthropic: createAnthropic({ apiKey: env.ANTHROPIC_API_KEY }),
    openai: createOpenAI({ apiKey: env.OPENAI_API_KEY }),
  });
  const model = registry.languageModel(env.LLM_MODEL);
  return { info: { mode: "real", model: env.LLM_MODEL }, model: () => model };
}

async function replayMockScript(agentName: string, options: CallOptions): Promise<GenerateResult> {
  const script = mockScripts.get(agentName);
  if (!script) {
    throw new Error(
      `No mock script is registered for "${agentName}". Call registerMockScript("${agentName}", script).`,
    );
  }
  const conversation = toConversation(agentName, options.prompt);
  const turn = await abortable(Promise.resolve(script(conversation)), options.abortSignal);
  const content: GenerateResult["content"] =
    "text" in turn
      ? [{ type: "text", text: turn.text }]
      : turn.toolCalls.map((call, i) => ({
          type: "tool-call",
          toolCallId: `mock_${conversation.turn}_${i + 1}`,
          toolName: call.toolName,
          input: JSON.stringify(call.input ?? {}),
        }));
  const inputTokens = estimateTokens(options.prompt);
  const outputTokens = estimateTokens(content);
  return {
    content,
    finishReason: { unified: "text" in turn ? "stop" : "tool-calls", raw: undefined },
    usage: {
      inputTokens: {
        total: inputTokens,
        noCache: inputTokens,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: { total: outputTokens, text: outputTokens, reasoning: undefined },
    },
    warnings: [],
  };
}

function toConversation(agentName: string, prompt: CallOptions["prompt"]): MockConversation {
  const inputs = new Map<string, unknown>();
  const results: MockToolResult[] = [];
  let lastResults: MockToolResult[] = [];
  let system = "";
  let userMessage: string | undefined;
  let turn = 1;

  for (const message of prompt) {
    if (message.role === "system") system = message.content;
    if (message.role === "user" && userMessage === undefined) {
      userMessage = message.content.map((part) => (part.type === "text" ? part.text : "")).join("");
    }
    if (message.role === "assistant") {
      turn += 1;
      lastResults = [];
      for (const part of message.content) {
        if (part.type === "tool-call") inputs.set(part.toolCallId, part.input);
      }
    }
    if (message.role === "tool") {
      for (const part of message.content) {
        if (part.type !== "tool-result") continue;
        const { output } = part;
        const result: MockToolResult = {
          toolName: part.toolName,
          input: inputs.get(part.toolCallId),
          output: "value" in output ? output.value : undefined,
          isError: output.type === "error-text" || output.type === "error-json",
        };
        results.push(result);
        lastResults.push(result);
      }
    }
  }
  return { agentName, system, userMessage: userMessage ?? "", turn, results, lastResults, prompt };
}

function estimateTokens(value: unknown): number {
  return Math.ceil(JSON.stringify(value).length / 4);
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promise;
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}
