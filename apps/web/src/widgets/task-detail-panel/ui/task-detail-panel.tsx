"use client";

import { ArrowLeft, X } from "lucide-react";
import {
  PriorityIcon,
  StatusIcon,
  TASK_PRIORITY_META,
  TASK_STATUS_META,
  useTask,
} from "@/entities/task";
import { ApiError } from "@/shared/api";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";

export type TaskDetailPanelProps = {
  taskId: number;
  /** Clears the selection. The panel renders its own back (mobile) and close (tablet, desktop) control. */
  onClose: () => void;
};

/**
 * The selected task. The Tasks page hosts it as a side panel, an overlay sheet or a full page,
 * depending on the width. This body is a placeholder until the full editor lands.
 */
export function TaskDetailPanel({ taskId, onClose }: TaskDetailPanelProps) {
  const { data: task, error, isLoading, mutate } = useTask(taskId);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-1.5 md:px-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Back to tasks"
          className="size-10 md:hidden"
        >
          <ArrowLeft className="size-4" aria-hidden />
        </Button>
        <span className="flex-1 text-[13px] text-muted-foreground tabular-nums">
          {task?.identifier}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close task"
          className="size-8 max-md:hidden"
        >
          <X className="size-4" aria-hidden />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
        {task ? (
          <article className="flex flex-col gap-4">
            <h2 className="text-lg leading-snug font-semibold text-balance">{task.title}</h2>
            <dl className="flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
              <div className="flex items-center gap-1.5">
                <dt className="sr-only">Status</dt>
                <StatusIcon status={task.status} />
                <dd>{TASK_STATUS_META[task.status].label}</dd>
              </div>
              <div className="flex items-center gap-1.5">
                <dt className="sr-only">Priority</dt>
                <PriorityIcon priority={task.priority} />
                <dd>{TASK_PRIORITY_META[task.priority].label}</dd>
              </div>
            </dl>
            <p className="rounded-md border border-dashed border-border px-4 py-3 text-[13px] text-muted-foreground">
              Editing, subtasks, links and notes are on their way to this panel.
            </p>
          </article>
        ) : error ? (
          <div className="flex flex-col items-start gap-3 text-[13px]">
            <p className="text-muted-foreground">
              {error instanceof ApiError && error.code === "not_found"
                ? "This task doesn't exist anymore. It may have been deleted."
                : "The task didn't load."}
            </p>
            {!(error instanceof ApiError && error.code === "not_found") && (
              <Button variant="outline" size="sm" onClick={() => void mutate()}>
                Try again
              </Button>
            )}
          </div>
        ) : (
          isLoading && (
            <div aria-busy="true" aria-label="Loading task" className="flex flex-col gap-4">
              <Skeleton className="h-6 w-3/4" />
              <div className="flex gap-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-28" />
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
