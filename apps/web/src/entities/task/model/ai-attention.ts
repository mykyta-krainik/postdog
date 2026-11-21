import type { AiState } from "@postdog/shared";

/** What the orange dot tells the user for each aiState, or null when there is no dot. */
export const AI_ATTENTION_HINT: Record<AiState, string | null> = {
  none: null,
  processing: null,
  suggestion_pending: "A suggestion is waiting for your review",
  clarification_pending: "An agent has a question for you",
};

/** The orange dot shows only while AI is on and the task waits for the user. */
export function shouldShowAiDot(aiState: AiState, aiEnabled: boolean): boolean {
  return aiEnabled && AI_ATTENTION_HINT[aiState] !== null;
}
