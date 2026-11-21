"use client";

import { useId } from "react";
import { toast } from "sonner";
import { updateSettings } from "@/entities/settings";
import { Switch } from "@/shared/ui/switch";

/** The AI kill switch. It always renders, so the user can turn AI back on. */
export function AiToggle({ enabled }: { enabled: boolean }) {
  const id = useId();

  async function change(next: boolean) {
    try {
      await updateSettings({ aiEnabled: next });
    } catch (error) {
      toast.error(next ? "AI is still off" : "AI is still on", {
        description: error instanceof Error ? error.message : "The API rejected the change.",
      });
    }
  }

  return (
    <label
      htmlFor={`${id}-switch`}
      className="flex cursor-pointer items-start gap-4 px-4 py-3.5 hover:bg-accent/40"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span id={`${id}-title`} className="text-[13px] font-medium text-foreground">
          AI features
        </span>
        <span id={`${id}-description`} className="text-[13px] leading-5 text-muted-foreground">
          Turn off to hide agents, suggestions and orange dots everywhere. The tracker keeps
          working, and pending suggestions come back when you turn AI on.
        </span>
      </span>
      <Switch
        id={`${id}-switch`}
        checked={enabled}
        onCheckedChange={(next) => void change(next)}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        className="mt-0.5 data-[state=checked]:bg-brand"
      />
    </label>
  );
}
