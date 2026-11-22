"use client";

import type { AiState } from "@postdog/shared";
import { cn } from "@/shared/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import { aiDotFor } from "../model/ai-attention";

/**
 * The orange dot when a task waits for the user, and a pulsing ring while an agent works on it.
 * Its hint is a tooltip and screen reader text. Renders nothing when AI is off.
 */
export function AiDot({
  aiState,
  aiEnabled,
  className,
}: {
  aiState: AiState;
  aiEnabled: boolean;
  className?: string;
}) {
  const dot = aiDotFor(aiState, aiEnabled);
  if (!dot) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          data-ai-dot={dot.kind}
          className={cn("flex size-4 shrink-0 items-center justify-center", className)}
        >
          <span
            aria-hidden
            className={cn(
              "block size-2 rounded-full",
              dot.kind === "attention"
                ? "bg-brand ring-[3px] ring-brand-soft"
                : "animate-pulse border-[1.5px] border-brand motion-reduce:animate-none",
            )}
          />
          <span className="sr-only">{dot.hint}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="left">{dot.hint}</TooltipContent>
    </Tooltip>
  );
}
