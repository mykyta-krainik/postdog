import type { DecompositionMode } from "@postdog/shared";

/** Auto applies changes without a review, so entering it needs the user's confirmation. */
export function needsConfirmation(from: DecompositionMode, to: DecompositionMode): boolean {
  return from !== to && to === "auto";
}

export const MODE_OPTIONS: Record<DecompositionMode, { label: string; description: string }> = {
  suggest: {
    label: "Suggest",
    description:
      "Proposed subtasks and links wait for your review. Nothing changes until you accept.",
  },
  auto: {
    label: "Auto",
    description: "Subtasks and relates links are created for you. Undo any of them from the Inbox.",
  },
};
