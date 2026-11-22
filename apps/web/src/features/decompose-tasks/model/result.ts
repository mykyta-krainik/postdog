import type { DecomposerOutcome, DecomposerOutput } from "@postdog/shared";

function plural(count: number, word: string, many = `${word}s`): string {
  return `${count} ${count === 1 ? word : many}`;
}

type Counts = DecomposerOutput["counts"];

/** The parts of the summary line, in the order the user acts on them. Zero counts are left out. */
const PARTS: [keyof Counts, (count: number) => string][] = [
  ["suggestedSubtasks", (count) => `${count} split`],
  ["needsClarification", (count) => plural(count, "question")],
  ["skipped", (count) => `${count} skipped`],
  ["duplicates", (count) => plural(count, "duplicate")],
  ["claimed", (count) => `${count} busy`],
  ["superseded", (count) => `${count} changed meanwhile`],
  ["failed", (count) => `${count} failed`],
];

/**
 * "Looked at 6 tasks: 3 split, 1 question, 1 skipped, 1 busy. Found 1 related group."
 * Null when the run looked at nothing, which the dialog words on its own.
 */
export function summaryLine(output: Pick<DecomposerOutput, "counts" | "related">): string | null {
  const { counts } = output;
  if (counts.considered === 0) return null;
  const parts = PARTS.filter(([key]) => counts[key] > 0).map(([key, word]) => word(counts[key]));
  const looked = `Looked at ${plural(counts.considered, "task")}`;
  const related =
    output.related.length > 0 ? ` Found ${plural(output.related.length, "related group")}.` : "";
  return `${parts.length > 0 ? `${looked}: ${parts.join(", ")}` : looked}.${related}`;
}

/** How each outcome reads in the per-task list. */
export const OUTCOME_LABEL: Record<DecomposerOutcome, string> = {
  suggested_subtasks: "Subtasks suggested",
  applied_subtasks: "Subtasks created",
  needs_clarification: "Has a question for you",
  skipped: "Skipped",
  duplicate: "Looks like a duplicate",
  claimed: "Busy in another run",
  superseded: "Changed during the run",
  failed: "Failed",
};
