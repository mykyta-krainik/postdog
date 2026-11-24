import {
  decomposerOutputSchema,
  plannerOutputSchema,
  statusUpdaterOutputSchema,
  type AgentName,
  type DecomposerOutput,
  type PlannerOutput,
  type StatusUpdaterOutput,
} from "@postdog/shared";
import type { ZodType } from "zod";
import type { AgentRunRow } from "../db/schema";
import { listOf, plural } from "../lib/text";
import type { NewNotification } from "../repositories/notifications";

type EndedRun = Pick<AgentRunRow, "id" | "agent" | "mode" | "status" | "output" | "error">;

interface Message {
  title: string;
  body: string;
}

const AGENT_TITLES: Record<AgentName, string> = {
  planner: "Planner",
  decomposer: "Decomposer",
  status_updater: "Status updater",
  docs_reviewer: "Docs reviewer",
};

const tasksThat = (n: number, one: string, many: string) =>
  `${plural(n, "task")} ${n === 1 ? one : many}`;

function plannerMessage({ focus, warnings }: PlannerOutput): Message {
  const warned = warnings.length > 0 ? ` ${plural(warnings.length, "warning")} to check.` : "";
  return {
    title: "Your plan for today is ready",
    body: `${plural(focus.length, "task")} to start with.${warned}`,
  };
}

function statusUpdateMessage(output: StatusUpdaterOutput): Message {
  if (output.kind === "update") {
    return { title: "Your status update is ready", body: output.update.headline };
  }
  return {
    title: "A status update needs a note from you",
    body: `${listOf(output.tasks.map((t) => t.identifier))}: ${output.question}`,
  };
}

function decomposerMessage({ counts, related }: DecomposerOutput): Message {
  const toReview = [
    counts.suggestedSubtasks > 0 &&
      tasksThat(counts.suggestedSubtasks, "has subtasks to review", "have subtasks to review"),
    counts.needsClarification > 0 &&
      tasksThat(counts.needsClarification, "needs your answer", "need your answers"),
    related.length > 0 && `${plural(related.length, "group")} of related tasks to review`,
  ].filter((part) => part !== false);
  const failed =
    counts.failed > 0 ? ` ${tasksThat(counts.failed, "was", "were")} not decomposed.` : "";
  if (toReview.length === 0) {
    return {
      title: "The Decomposer found nothing to split",
      body: `It looked at ${plural(counts.considered, "task")}.${failed}`,
    };
  }
  return {
    title: "The Decomposer has suggestions to review",
    body: `${toReview.join(", ")}.${failed}`,
  };
}

function read<T>(schema: ZodType<T>, output: unknown, message: (output: T) => Message) {
  const parsed = schema.safeParse(output);
  return parsed.success ? message(parsed.data) : null;
}

/** What each agent says when a run completes. An auto Decomposer run writes its own notifications. */
const COMPLETED: Record<AgentName, (run: EndedRun) => Message | null> = {
  planner: ({ output }) => read(plannerOutputSchema, output, plannerMessage),
  status_updater: ({ output }) => read(statusUpdaterOutputSchema, output, statusUpdateMessage),
  decomposer: ({ output, mode }) =>
    mode === "auto" ? null : read(decomposerOutputSchema, output, decomposerMessage),
  docs_reviewer: () => null,
};

/**
 * The Inbox entry for a run that just ended, or undefined. A completed run gets `run_finished`
 * when nobody watched it. A failed run gets `agent_failed` when nobody watched it, and always
 * when it is a Decomposer run or was interrupted by a restart. A cancelled run gets nothing.
 */
export function runEndNotification(
  run: EndedRun,
  watched: boolean,
  now: number,
): NewNotification | undefined {
  const about = { runId: run.id, createdAt: now };
  if (run.status === "completed") {
    const message = watched ? null : COMPLETED[run.agent](run);
    return message ? { kind: "run_finished", ...message, ...about } : undefined;
  }
  if (run.status !== "failed" || !run.error) return undefined;
  const alwaysTold = run.agent === "decomposer" || run.error.code === "interrupted";
  if (watched && !alwaysTold) return undefined;
  return {
    kind: "agent_failed",
    title: `The ${AGENT_TITLES[run.agent]} failed`,
    body: run.error.message,
    ...about,
  };
}
