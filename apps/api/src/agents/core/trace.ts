import type { AgentUsage, TraceStep } from "@postdog/shared";

export const TRACE_INPUT_MAX = 500;
const SUMMARY_MAX = 500;

export type TraceEntry = Omit<TraceStep, "step" | "input"> & { input: unknown };

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function toText(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value) ?? String(value);
}

export function createTraceRecorder(onChange?: (steps: TraceStep[], usage: AgentUsage) => void) {
  const steps: TraceStep[] = [];
  const usage: AgentUsage = { inputTokens: 0, outputTokens: 0 };
  const copySteps = (): TraceStep[] => steps.map((step) => ({ ...step }));
  const copyUsage = (): AgentUsage => ({ ...usage });

  return {
    record(entry: TraceEntry): TraceStep {
      const step: TraceStep = {
        ...entry,
        step: steps.length + 1,
        input: truncate(toText(entry.input), TRACE_INPUT_MAX),
        outputSummary: truncate(entry.outputSummary, SUMMARY_MAX),
        durationMs: Math.max(0, Math.round(entry.durationMs)),
      };
      steps.push(step);
      if (step.tokens) {
        usage.inputTokens += step.tokens.input;
        usage.outputTokens += step.tokens.output;
      }
      onChange?.(copySteps(), copyUsage());
      return step;
    },
    steps: copySteps,
    usage: copyUsage,
  };
}

export type TraceRecorder = ReturnType<typeof createTraceRecorder>;
