import type { TraceStep } from "@postdog/shared";

/** One step in words: `done` for the timeline, `doing` for the progress text while the run works. */
export type StepActivity = { done: string; doing: string };

const IDENTIFIER = /\b[A-Z][A-Z0-9]*-\d+\b/;

/** `input` is a truncated JSON string, so fields are read with patterns that survive the cut. */
function readNumber(input: string, field: string): number | undefined {
  const match = new RegExp(`"${field}"\\s*:\\s*(\\d+)`).exec(input);
  return match ? Number(match[1]) : undefined;
}

function readString(input: string, field: string): string | undefined {
  const match = new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`).exec(input);
  return match?.[1];
}

function countOf(input: string, field: string): number {
  return input.match(new RegExp(`"${field}"\\s*:`, "g"))?.length ?? 0;
}

/** "PD-12" when the step's summary names it, else the numeric id the model passed. */
function taskRef(step: TraceStep, idField: string): string {
  const identifier = IDENTIFIER.exec(step.outputSummary)?.[0];
  if (identifier) return identifier;
  const id = readNumber(step.input, idField);
  return id === undefined ? "a task" : `task ${id}`;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

const TOOL_ACTIVITY: Record<string, (step: TraceStep) => StepActivity> = {
  get_task: (step) => {
    const task = taskRef(step, "id");
    return { done: `Looked at ${task}`, doing: `Looking at ${task}` };
  },
  search_tasks: (step) => {
    const query = readString(step.input, "query");
    const what = query === undefined ? "tasks" : `tasks for '${query}'`;
    return { done: `Searched ${what}`, doing: `Searching ${what}` };
  },
  get_task_notes: (step) => {
    const task = taskRef(step, "taskId");
    return { done: `Read the notes on ${task}`, doing: `Reading the notes on ${task}` };
  },
  submit_daily_plan: (step) => {
    const count = countOf(step.input, "taskId");
    return {
      done: count > 0 ? `Proposed ${plural(count, "focus task")}` : "Proposed a plan",
      doing: "Checking the plan",
    };
  },
  submit_status_update: () => ({ done: "Drafted the update", doing: "Checking the update" }),
  ask_for_notes: (step) => {
    const ids = /"taskIds"\s*:\s*\[([^\]]*)/.exec(step.input)?.[1] ?? "";
    const count = ids.match(/\d+/g)?.length ?? 0;
    return {
      done: count > 0 ? `Asked for notes on ${plural(count, "task")}` : "Asked for notes",
      doing: "Asking for notes",
    };
  },
  report_related: (step) => {
    const groups = countOf(step.input, "relation");
    return {
      done: groups > 0 ? `Found ${plural(groups, "related group")}` : "Found no related tasks",
      doing: "Looking for related tasks",
    };
  },
  propose_subtasks: (step) => {
    const count = countOf(step.input, "title");
    return {
      done: count > 0 ? `Proposed ${plural(count, "subtask")}` : "Proposed subtasks",
      doing: "Checking the subtasks",
    };
  },
  ask_clarification: () => ({ done: "Asked a question", doing: "Writing a question" }),
  skip: () => ({ done: "Skipped the task", doing: "Skipping the task" }),
};

export function describeStep(step: TraceStep): StepActivity {
  switch (step.type) {
    case "llm":
      return { done: "Asked the model", doing: "Thinking" };
    case "validation":
      return { done: "Checked the result", doing: "Checking the result" };
    case "tool": {
      const tool = step.tool ?? "a tool";
      return TOOL_ACTIVITY[tool]?.(step) ?? { done: `Called ${tool}`, doing: `Calling ${tool}` };
    }
  }
}

/** "Looked at PD-12, searched tasks for 'auth', proposed 4 focus tasks". Model calls are left out. */
export function summarizeTrace(trace: readonly TraceStep[]): string {
  return trace
    .filter((step) => step.type === "tool")
    .map((step, index) => {
      const { done } = describeStep(step);
      return index === 0 ? done : done.charAt(0).toLowerCase() + done.slice(1);
    })
    .join(", ");
}

/** The staged progress line of a running run: what its latest step is about. */
export function progressText(trace: readonly TraceStep[]): string {
  const last = trace.at(-1);
  if (!last) return "Getting started…";
  return `${describeStep(last).doing}…`;
}
