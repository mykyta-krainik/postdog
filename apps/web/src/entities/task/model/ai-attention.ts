import type { AiState } from "@postdog/shared";

/** A task waits for the user (the orange dot), or an agent holds it right now. */
export type AiDotState = { kind: "attention" | "working"; hint: string };

const AI_DOT: Record<AiState, AiDotState | null> = {
  none: null,
  processing: { kind: "working", hint: "Postdog is working on this" },
  suggestion_pending: { kind: "attention", hint: "Suggestions to review" },
  clarification_pending: { kind: "attention", hint: "Waiting for your answer" },
};

/** The dot a task row shows for its aiState, or null. Nothing shows while AI is off. */
export function aiDotFor(aiState: AiState, aiEnabled: boolean): AiDotState | null {
  return aiEnabled ? AI_DOT[aiState] : null;
}
