import {
  askClarificationInputSchema,
  proposeSubtasksInputSchema,
  reportRelatedInputSchema,
  skipInputSchema,
} from "@postdog/shared";
import type { z } from "zod";
import type { Executor } from "../../db/client";
import { defineTerminalTool, type ReadTool } from "../core/tool";
import { createReadTools } from "../tools/read";
import { tagUserText } from "../tools/userText";

export const reportRelated = defineTerminalTool({
  name: "report_related",
  description: [
    "Report the groups of related tasks you found: tasks that describe the same work (duplicates) or share part of it (overlaps).",
    "Call it once, when you have compared the batch. It ends your work. Report an empty list when nothing is related.",
    "Do not put a task in a group only because it touches the same area; the work itself must match.",
    'Example: {"groups": [{"relation": "duplicates", "taskIds": [9, 19], "reason": "Both ask for per-key rate limits on the public API."}]}.',
  ].join(" "),
  input: reportRelatedInputSchema,
});

export const proposeSubtasks = defineTerminalTool({
  name: "propose_subtasks",
  description: [
    "Propose 2 to 8 subtasks that together finish the task, in the order to do them, with a short rationale.",
    "Use it when the task has a clear outcome and scope and takes more than one step.",
    "Do not use it when the task is unclear (ask_clarification) or already one step (skip).",
    'Example: {"subtasks": [{"title": "Add the rate limit middleware", "description": "Count requests per API key in Redis."}, {"title": "Answer 429 with Retry-After", "description": "", "priority": "high"}], "rationale": "Middleware first, then the response contract."}.',
  ].join(" "),
  input: proposeSubtasksInputSchema,
});

export const askClarification = defineTerminalTool({
  name: "ask_clarification",
  description: [
    "Ask the user 1 to 3 short questions when the task has no clear outcome or scope.",
    "Use it instead of guessing what the user meant.",
    "Do not use it for details you can decide yourself or look up with get_task.",
    'Example: {"questions": ["Which pages are slow?", "What load time counts as done?"], "whatIsUnclear": "The task names no page and no target, so the scope and the outcome are unclear."}.',
  ].join(" "),
  input: askClarificationInputSchema,
});

export const skip = defineTerminalTool({
  name: "skip",
  description: [
    "Leave the task without subtasks: already_atomic when it is one step of work, not_actionable when it is not work to do.",
    "Use it when splitting would only add overhead.",
    "Do not use it when the task is unclear; use ask_clarification for that.",
    'Example: {"reason": "already_atomic", "explanation": "Bumping one dependency is a single change."}.',
  ].join(" "),
  input: skipInputSchema,
});

function tagged<N extends string, S extends z.ZodType, O>(
  tool: ReadTool<N, S, O>,
): ReadTool<N, S, O> {
  return { ...tool, run: (input) => tagUserText(tool.run(input)) };
}

export function decomposerReadTools(ex: Executor) {
  const { getTask, searchTasks } = createReadTools(ex);
  const summarize = (task: ReturnType<typeof getTask.run>) => `${task.identifier} (${task.status})`;
  return [{ ...tagged(getTask), summarize }, tagged(searchTasks)] as const;
}
