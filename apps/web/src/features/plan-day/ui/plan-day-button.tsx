"use client";

import { LoaderCircle, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AgentRunStatus, MockAiBadge, isRunBusy } from "@/entities/agent-run";
import { useSettings } from "@/entities/settings";
import { routes } from "@/shared/config";
import { Button } from "@/shared/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { usePlanDay } from "../model/use-plan-day";

/**
 * "Plan my day" for a toolbar. It starts a Planner run and shows the run in a popover: progress
 * and Cancel, then the plan with a link to Today, or what failed with Retry. Hidden while AI is off.
 */
export function PlanDayButton() {
  const { aiEnabled } = useSettings();
  const runner = usePlanDay();
  const [open, setOpen] = useState(false);

  if (!aiEnabled) return null;
  const busy = isRunBusy(runner.view);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-10 gap-1.5 border-brand/40 px-3 text-[13px] hover:border-brand/70 md:h-8"
          onClick={(event) => {
            if (runner.view.status === "idle") {
              event.preventDefault();
              runner.start();
              setOpen(true);
            }
          }}
        >
          {busy ? (
            <LoaderCircle
              className="size-4 animate-spin text-brand motion-reduce:animate-none"
              aria-hidden
            />
          ) : (
            <Sparkles className="size-4 text-brand" aria-hidden />
          )}
          {busy ? "Planning…" : "Plan my day"}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 p-3"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-medium">Plan my day</p>
          <MockAiBadge aiEnabled={aiEnabled} />
        </div>
        {runner.view.status === "idle" ? (
          <Button size="sm" className="h-10 self-start md:h-8" onClick={runner.start}>
            Plan my day
          </Button>
        ) : (
          <AgentRunStatus
            view={runner.view}
            agent="planner"
            onCancel={runner.cancel}
            onRetry={runner.start}
            result={(run) => (
              <div className="flex flex-col gap-2">
                <ol className="flex flex-col">
                  {run.output?.focus.map((item) => (
                    <li key={item.taskId} className="flex h-8 items-center gap-2 text-[13px]">
                      <span className="w-12 shrink-0 text-muted-foreground tabular-nums">
                        {item.identifier}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    </li>
                  ))}
                </ol>
                <div className="flex items-center gap-2">
                  <Button asChild size="sm" className="h-10 md:h-8">
                    <Link href={routes.today} onClick={() => setOpen(false)}>
                      Open Today
                    </Link>
                  </Button>
                  <Button variant="ghost" size="sm" className="h-10 md:h-8" onClick={runner.start}>
                    Plan again
                  </Button>
                </div>
              </div>
            )}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}
