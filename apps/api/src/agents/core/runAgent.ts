import { AGENT_LIMITS } from "@postdog/shared";
import { generateText, type ModelMessage, type ToolResultPart } from "ai";
import { AgentError, ToolError } from "./errors";
import type { Llm } from "./llm";
import { describeIssues, toToolSet, type AgentTool, type TerminalCall } from "./tool";
import { toText, truncate, type TraceRecorder } from "./trace";
import type { RunTracer } from "./tracer";

export const DEFAULT_MAX_OUTPUT_TOKENS = 4096;

export interface LoopDeps {
  signal: AbortSignal;
  trace: TraceRecorder;
  llm: Llm;
  tracer: RunTracer;
}

export interface RunAgentParams<T extends readonly AgentTool[]> extends LoopDeps {
  name: string;
  system: string;
  userMessage: string;
  tools: T;
  maxSteps?: number;
  maxOutputTokens?: number;
  wallClockMs?: number;
  onStep?(step: number): void;
}

export type AgentResult<T extends readonly AgentTool[]> = TerminalCall<T[number]> & {
  steps: number;
};

type ToolOutput = ToolResultPart["output"];

interface ToolCall {
  toolCallId: string;
  toolName: string;
  input: unknown;
}

type CallOutcome =
  | { kind: "terminal"; toolName: string; output: unknown }
  | { kind: "invalid"; message: string }
  | { kind: "result"; output: ToolOutput };

const ALREADY_HAVE_IT =
  "You already called this tool with this exact input and have this data. Use it, or call a different tool.";

export async function runAgent<const T extends readonly AgentTool[]>(
  params: RunAgentParams<T>,
): Promise<AgentResult<T>> {
  const { name, system, userMessage, tools, signal, trace, llm, tracer } = params;
  const maxSteps = params.maxSteps ?? AGENT_LIMITS.maxSteps;
  const maxOutputTokens = params.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  const wallClockMs = params.wallClockMs ?? AGENT_LIMITS.wallClockMs;

  const byName = new Map<string, AgentTool>(tools.map((t) => [t.name, t]));
  const toolNames = tools.map((t) => t.name).join(", ");
  const terminalNames = tools
    .filter((t) => t.terminal)
    .map((t) => t.name)
    .join(", ");
  const toolSet = toToolSet(tools);
  const timeout = AbortSignal.timeout(wallClockMs);
  const loopSignal = AbortSignal.any([signal, timeout]);
  const messages: ModelMessage[] = [{ role: "user", content: userMessage }];

  let nudged = false;
  let invalidSteps = 0;
  let previous: { key: string; output: ToolOutput } | undefined;

  const stopped = (): AgentError => {
    if (signal.aborted) {
      return signal.reason instanceof AgentError
        ? signal.reason
        : new AgentError("cancelled", "The run was cancelled.");
    }
    return new AgentError(
      "timeout",
      `Stopped after ${wallClockMs / 1000} s, the time limit for one agent loop.`,
    );
  };

  const callModel = async (step: number, newInput: string) => {
    const started = performance.now();
    const generation = tracer.generation({
      name: `${name} step ${step}`,
      model: llm.info.model,
      input: messages,
    });
    const result = await generateText({
      model: llm.model(name),
      instructions: system,
      messages,
      tools: toolSet,
      maxOutputTokens,
      abortSignal: loopSignal,
    }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      generation.end({ error: message });
      trace.record({
        type: "llm",
        input: newInput,
        outputSummary: `Model call failed: ${message}`,
        durationMs: performance.now() - started,
      });
      if (loopSignal.aborted) throw stopped();
      throw new AgentError("llm_error", `The model call failed: ${message}`);
    });
    const tokens = { input: result.usage.inputTokens ?? 0, output: result.usage.outputTokens ?? 0 };
    const calls = result.toolCalls.map((call): ToolCall => ({
      toolCallId: call.toolCallId,
      toolName: call.toolName,
      input: call.input,
    }));
    const outputSummary =
      calls.length > 0
        ? `Called ${calls.map((c) => `${c.toolName}(${toText(c.input)})`).join(", ")}`
        : `Replied without a tool call: ${result.text}`;
    generation.end({ output: { text: result.text, toolCalls: calls }, usage: tokens });
    trace.record({
      type: "llm",
      input: newInput,
      outputSummary,
      durationMs: performance.now() - started,
      tokens,
    });
    if (result.finishReason === "length") {
      throw new AgentError(
        "llm_error",
        `The model's answer was cut off at ${maxOutputTokens} tokens, the output limit of one step.`,
      );
    }
    const assistant = result.response.messages.find((m) => m.role === "assistant");
    return { calls, assistant };
  };

  const runTool = async (call: ToolCall): Promise<CallOutcome> => {
    const started = performance.now();
    const tool = byName.get(call.toolName);
    const invalid = (message: string): CallOutcome => {
      trace.record({
        type: "validation",
        tool: call.toolName,
        input: call.input,
        outputSummary: message,
        durationMs: performance.now() - started,
      });
      tracer.span({ name: call.toolName, input: call.input }).end({ error: message });
      return { kind: "invalid", message };
    };

    if (!tool) return invalid(`Unknown tool "${call.toolName}". Use one of: ${toolNames}.`);
    const parsed = tool.input.safeParse(call.input);
    if (!parsed.success) {
      return invalid(
        `Invalid input for ${tool.name}: ${describeIssues(parsed.error)}. Fix the input and call ${tool.name} again.`,
      );
    }

    const span = tracer.span({ name: tool.name, input: parsed.data });
    if (tool.terminal) {
      trace.record({
        type: "tool",
        tool: tool.name,
        input: parsed.data,
        outputSummary: "Final answer submitted",
        durationMs: performance.now() - started,
      });
      span.end({ output: "Final answer submitted" });
      return { kind: "terminal", toolName: tool.name, output: parsed.data };
    }

    const key = `${tool.name}:${JSON.stringify(parsed.data)}`;
    let output: ToolOutput;
    let summary: string;
    if (previous?.key === key) {
      output = withNote(previous.output);
      summary = "Repeated call; returned the cached result";
    } else {
      try {
        const value = await tool.run(parsed.data);
        output = { type: "json", value: JSON.parse(JSON.stringify(value ?? null)) };
        summary = tool.summarize ? tool.summarize(value) : toText(value);
      } catch (err) {
        if (!(err instanceof ToolError)) throw err;
        output = { type: "error-text", value: err.message };
        summary = err.message;
      }
      previous = { key, output };
    }
    trace.record({
      type: "tool",
      tool: tool.name,
      input: parsed.data,
      outputSummary: summary,
      durationMs: performance.now() - started,
    });
    span.end({
      output: summary,
      ...(output.type === "error-text" && { error: output.value }),
    });
    return { kind: "result", output };
  };

  let newInput = userMessage;
  for (let step = 1; step <= maxSteps; step++) {
    if (loopSignal.aborted) throw stopped();
    const { calls, assistant } = await callModel(step, newInput);
    params.onStep?.(step);

    if (calls.length === 0) {
      if (nudged) {
        throw new AgentError(
          "no_terminal_tool",
          `The model replied twice without calling a tool. It must finish by calling one of: ${terminalNames}.`,
        );
      }
      nudged = true;
      const nudge = `Finish by calling one of: ${terminalNames}.`;
      if (assistant && assistant.content.length > 0) messages.push(assistant);
      messages.push({ role: "user", content: nudge });
      newInput = nudge;
      continue;
    }

    const results: ToolResultPart[] = [];
    let lastInvalid = "";
    let anyValid = false;
    for (const call of calls) {
      if (loopSignal.aborted) throw stopped();
      const outcome = await runTool(call);
      if (outcome.kind === "terminal") {
        return {
          toolName: outcome.toolName,
          output: outcome.output,
          steps: step,
        } as AgentResult<T>;
      }
      if (outcome.kind === "invalid") lastInvalid = outcome.message;
      else anyValid = true;
      results.push({
        type: "tool-result",
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        output:
          outcome.kind === "invalid"
            ? { type: "error-text", value: outcome.message }
            : outcome.output,
      });
    }
    invalidSteps = anyValid ? 0 : invalidSteps + 1;
    if (invalidSteps >= AGENT_LIMITS.maxConsecutiveValidationErrors) {
      throw new AgentError(
        "validation_failed",
        `The model sent only invalid tool calls in ${invalidSteps} steps in a row. Last error: ${truncate(lastInvalid, 300)}`,
      );
    }
    messages.push(
      assistant ?? {
        role: "assistant",
        content: calls.map((c) => ({ type: "tool-call", ...c, input: asObject(c.input) })),
      },
      { role: "tool", content: results },
    );
    newInput = `Tool results: ${results.map((r) => r.toolName).join(", ")}`;
  }

  throw new AgentError(
    "step_limit",
    `Stopped after ${maxSteps} steps without a call to ${terminalNames}.`,
  );
}

function withNote(output: ToolOutput): ToolOutput {
  if (output.type === "json") {
    return { type: "json", value: { note: ALREADY_HAVE_IT, result: output.value } };
  }
  if (output.type === "error-text") {
    return { type: "error-text", value: `${output.value} ${ALREADY_HAVE_IT}` };
  }
  return output;
}

function asObject(input: unknown): Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}
