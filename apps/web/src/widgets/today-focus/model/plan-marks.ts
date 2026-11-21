import { z } from "zod";

/** What the user did with the items of one plan. Only the latest plan's marks are kept. */
export type PlanMarks = { dismissed: readonly number[]; started: readonly number[] };

export const EMPTY_MARKS: PlanMarks = { dismissed: [], started: [] };

export const PLAN_MARKS_KEY = "postdog:today-plan";

const storedSchema = z.object({
  runId: z.number(),
  dismissed: z.array(z.number()),
  started: z.array(z.number()),
});

/** localStorage, or undefined where reading it throws (blocked storage, private modes, the server). */
function defaultStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/** The marks saved for this plan, or none. Storage that is missing, broken or blocked reads as none. */
export function readPlanMarks(runId: number, storage = defaultStorage()): PlanMarks {
  try {
    const raw = storage?.getItem(PLAN_MARKS_KEY);
    if (!raw) return EMPTY_MARKS;
    const stored = storedSchema.safeParse(JSON.parse(raw));
    if (!stored.success || stored.data.runId !== runId) return EMPTY_MARKS;
    return { dismissed: stored.data.dismissed, started: stored.data.started };
  } catch {
    return EMPTY_MARKS;
  }
}

/** Saves the marks of this plan over any older plan's. A failed write keeps the page working. */
export function writePlanMarks(runId: number, marks: PlanMarks, storage = defaultStorage()): void {
  try {
    storage?.setItem(PLAN_MARKS_KEY, JSON.stringify({ runId, ...marks }));
  } catch {
    // Full or blocked storage: the marks last until the page reloads.
  }
}

/** "3 tasks changed since this plan", or null when nothing changed. */
export function changedSinceText(count: number): string | null {
  if (count <= 0) return null;
  return `${count} ${count === 1 ? "task" : "tasks"} changed since this plan`;
}
