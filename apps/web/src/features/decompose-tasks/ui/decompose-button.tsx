"use client";

import { AGENT_LIMITS, type DecompositionMode } from "@postdog/shared";
import { ListTree, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  AgentDialog,
  AgentRunStatus,
  findRunning,
  isRunBusy,
  useRunningRuns,
} from "@/entities/agent-run";
import { useSettings } from "@/entities/settings";
import { routes } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { useDecompose } from "../model/use-decompose";
import { DecomposeResult } from "./decompose-result";

const ACTION = "h-10 px-3 text-[13px] md:h-8";

const MODE_HINT: Record<DecompositionMode, string> = {
  suggest: "Suggest mode: you review every change.",
  auto: "Auto mode: creates subtasks and links right away; undo from the Inbox.",
};

const MODE_DESCRIPTION: Record<DecompositionMode, string> = {
  suggest: `Looks at up to ${AGENT_LIMITS.maxDecomposerTasksPerRun} to-do tasks and suggests subtasks. Nothing changes until you accept.`,
  auto: `Looks at up to ${AGENT_LIMITS.maxDecomposerTasksPerRun} to-do tasks, then creates subtasks and relates links. Its questions still wait for you.`,
};

/**
 * "Decompose" for the Tasks toolbar. It opens a dialog that says what the Decomposer does,
 * starts a default run, and shows the run: progress and Cancel, the per-task result, or what
 * failed with Retry. While another Decomposer batch is going, started in another tab or before
 * the user left, it links to that run instead of starting one. Icon only below 768 px. Hidden
 * while AI is off.
 */
export function DecomposeButton() {
  const { aiEnabled, settings } = useSettings();
  const runner = useDecompose();
  const { runs } = useRunningRuns(aiEnabled);
  const [open, setOpen] = useState(false);

  if (!aiEnabled) return null;
  const idle = runner.view.status === "idle";
  const elsewhere = idle ? findRunning(runs, { agent: "decomposer" }) : undefined;
  const busy = isRunBusy(runner.view) || elsewhere !== undefined;
  const Icon = busy ? LoaderCircle : ListTree;
  const mode = settings?.decompositionMode ?? "suggest";

  return (
    <>
      <Button
        variant="outline"
        aria-label="Decompose"
        title="Decompose"
        className="h-10 gap-1.5 border-brand/40 px-3 text-[13px] hover:border-brand/70 max-md:w-10 max-md:px-0 md:h-8"
        onClick={() => setOpen(true)}
      >
        <Icon
          className={cn("size-4 text-brand", busy && "animate-spin motion-reduce:animate-none")}
          aria-hidden
        />
        <span className="max-md:sr-only">Decompose</span>
      </Button>
      <AgentDialog
        open={open}
        onOpenChange={setOpen}
        title="Decompose"
        description={MODE_DESCRIPTION[mode]}
      >
        <div className="flex min-w-0 flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            {MODE_HINT[mode]}{" "}
            <Link
              href={routes.settings}
              className="underline underline-offset-2 hover:text-foreground"
              onClick={() => setOpen(false)}
            >
              Change it in Settings
            </Link>
          </p>
          {elsewhere ? (
            <p role="status" className="text-[13px] text-muted-foreground">
              A Decomposer run is already going.{" "}
              <Link
                href={routes.run(elsewhere.id)}
                className="text-brand-text underline underline-offset-2"
                onClick={() => setOpen(false)}
              >
                Watch it on the Runs page
              </Link>
            </p>
          ) : idle ? (
            <Button size="sm" className={cn(ACTION, "self-start")} onClick={runner.start}>
              Find subtasks
            </Button>
          ) : (
            <AgentRunStatus
              view={runner.view}
              agent="decomposer"
              onCancel={runner.cancel}
              onRetry={runner.start}
              result={(run) => (
                <div className="flex flex-col gap-3">
                  <DecomposeResult run={run} onOpenTask={() => setOpen(false)} />
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(ACTION, "self-start")}
                    onClick={runner.start}
                  >
                    Run again
                  </Button>
                </div>
              )}
            />
          )}
        </div>
      </AgentDialog>
    </>
  );
}
