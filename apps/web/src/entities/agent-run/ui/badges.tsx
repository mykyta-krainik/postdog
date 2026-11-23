"use client";

import type { LlmInfo } from "@postdog/shared";
import { FlaskConical, Sparkles } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { useAgentsInfo } from "../api/queries";

/** Marks agent output the user has not acted on yet. */
export function SuggestedBadge({ className }: { className?: string }) {
  return (
    <Badge variant="brand" className={cn("font-normal", className)}>
      <Sparkles aria-hidden />
      Suggested
    </Badge>
  );
}

/** Shown when an LLM layer is the scripted mock, so nobody mistakes its output for a real model's. */
export function MockAiBadgeView({
  llm,
  className,
}: {
  llm: LlmInfo | undefined;
  className?: string;
}) {
  if (llm?.mode !== "mock") return null;
  return (
    <Badge
      variant="outline"
      title="Agents replay scripted answers. Set a provider key and LLM_MOCK=false to use a real model."
      className={cn("border-brand/40 font-normal text-brand-text", className)}
    >
      <FlaskConical aria-hidden />
      Mock AI
    </Badge>
  );
}

/** The "Mock AI" badge for the model layer in use now. Renders nothing while AI is off. */
export function MockAiBadge({ aiEnabled, className }: { aiEnabled: boolean; className?: string }) {
  const { data } = useAgentsInfo(aiEnabled);
  if (!aiEnabled) return null;
  return <MockAiBadgeView llm={data?.llm} className={className} />;
}
