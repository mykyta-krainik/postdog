"use client";

import { decomposerRunSchema } from "@postdog/shared";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useAgentRun } from "@/entities/agent-run";
import { routes } from "@/shared/config";
import { Button } from "@/shared/ui/button";

/** The failed run's trace, mounted only once the user asks for it. */
export function FailedRunTrace({
  runId,
  renderTrace,
}: {
  runId: number;
  renderTrace: (runId: number) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="ghost"
        size="sm"
        aria-expanded={open}
        className="-ml-2 h-10 gap-1 self-start px-2 text-[13px] text-muted-foreground md:h-8"
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronRight
          className={open ? "rotate-90 transition-transform" : "transition-transform"}
          aria-hidden
        />
        {open ? "Hide trace" : `Show trace of run #${runId}`}
      </Button>
      {open && renderTrace(runId)}
    </div>
  );
}

/**
 * The tasks a conflict is about: the ones the run recorded as changed during the run.
 * Renders nothing when the run is not a Decomposer run or names no such task.
 */
export function ConflictTasks({ runId }: { runId: number }) {
  const { data: run } = useAgentRun(runId, decomposerRunSchema);
  const tasks = run?.output?.tasks.filter((task) => task.outcome === "superseded") ?? [];
  if (tasks.length === 0) return null;
  return (
    <ul aria-label="Tasks involved" className="flex flex-wrap gap-x-3">
      {tasks.map((task) => (
        <li key={task.taskId}>
          <Link
            href={routes.task(task.taskId)}
            className="flex min-h-10 min-w-0 items-center gap-2 rounded-sm text-[13px] outline-none hover:underline focus-visible:ring-1 focus-visible:ring-ring md:min-h-6"
          >
            <span className="text-xs text-muted-foreground tabular-nums">{task.identifier}</span>
            <span className="min-w-0 truncate">{task.title}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
