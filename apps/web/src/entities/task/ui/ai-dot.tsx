import type { AiState } from "@postdog/shared";
import { cn } from "@/shared/lib/utils";
import { AI_ATTENTION_HINT, shouldShowAiDot } from "../model/ai-attention";

/** The orange dot: an agent waits for the user. Renders nothing when AI is off. */
export function AiDot({
  aiState,
  aiEnabled,
  className,
}: {
  aiState: AiState;
  aiEnabled: boolean;
  className?: string;
}) {
  if (!shouldShowAiDot(aiState, aiEnabled)) return null;
  const hint = AI_ATTENTION_HINT[aiState] ?? undefined;
  return (
    <span
      role="img"
      aria-label={hint}
      title={hint}
      className={cn(
        "inline-block size-2 shrink-0 rounded-full bg-brand ring-[3px] ring-brand-soft",
        className,
      )}
    />
  );
}
