"use client";

import { ArrowLeft, CornerLeftUp, X } from "lucide-react";
import Link from "next/link";
import { DeleteTaskButton } from "@/features/task-delete";
import { TaskContentForm, TaskPriorityPicker, TaskStatusPicker } from "@/features/task-edit";
import { WriteStatusUpdateButton } from "@/features/write-status-update";
import { StatusIcon, useTask, useTaskListParams, type TaskDetail } from "@/entities/task";
import { ApiError } from "@/shared/api";
import { formatDateTime, formatShortDate } from "@/shared/lib/format";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import { LinksSection } from "./links-section";
import { NotesSection } from "./notes-section";
import { SubtasksSection } from "./subtasks-section";

export type TaskDetailPanelProps = {
  taskId: number;
  /** Clears the selection. The panel renders its own back (mobile) and close (tablet, desktop) control. */
  onClose: () => void;
};

/** A subtask shows where it belongs. Nesting is one level, so a parent is always top-level. */
function ParentLink({ parentId }: { parentId: number }) {
  const { data: parent } = useTask(parentId);
  const { hrefWith } = useTaskListParams();
  return (
    <Link
      href={hrefWith({ selectedTaskId: parentId })}
      scroll={false}
      className="-mx-1.5 flex h-10 max-w-full min-w-0 items-center gap-1.5 self-start rounded-md px-1.5 text-xs text-muted-foreground outline-none hover:bg-accent/50 hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring md:h-7"
    >
      <CornerLeftUp className="size-3.5 shrink-0" aria-hidden />
      <span className="shrink-0">Subtask of</span>
      {parent ? (
        <>
          <StatusIcon status={parent.status} />
          <span className="shrink-0 tabular-nums">{parent.identifier}</span>
          <span className="min-w-0 truncate text-foreground">{parent.title}</span>
        </>
      ) : (
        <Skeleton className="h-3 w-32" />
      )}
    </Link>
  );
}

function TaskDetailBody({ task }: { task: TaskDetail }) {
  return (
    <article className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        {task.parentId !== null && <ParentLink parentId={task.parentId} />}
        <TaskContentForm task={task}>
          <div className="flex flex-wrap items-center gap-2">
            <TaskStatusPicker task={task} />
            <TaskPriorityPicker task={task} />
            <time
              dateTime={new Date(task.createdAt).toISOString()}
              title={`Created ${formatDateTime(task.createdAt)}`}
              className="ml-auto text-xs text-muted-foreground tabular-nums"
            >
              Created {formatShortDate(task.createdAt)}
            </time>
          </div>
        </TaskContentForm>
      </div>
      {task.parentId === null && <SubtasksSection task={task} />}
      <LinksSection links={task.links} />
      <NotesSection taskId={task.id} />
    </article>
  );
}

function PanelSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading task" className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-4/5" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-28 md:h-7" />
          <Skeleton className="h-10 w-24 md:h-7" />
        </div>
        <div className="flex flex-col gap-2 pt-2">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-11/12" />
          <Skeleton className="h-3.5 w-3/5" />
        </div>
      </div>
      {["w-3/4", "w-2/3"].map((width) => (
        <div key={width} className="flex flex-col gap-3 border-t border-border pt-5">
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className={`h-3.5 ${width}`} />
          <Skeleton className="h-3.5 w-1/2" />
        </div>
      ))}
    </div>
  );
}

function PanelError({
  error,
  retrying,
  onRetry,
  onClose,
}: {
  error: unknown;
  retrying: boolean;
  onRetry: () => void;
  onClose: () => void;
}) {
  const gone = error instanceof ApiError && error.code === "not_found";
  const unreachable = error instanceof ApiError && error.code === "network_error";
  return (
    <div role="alert" className="flex flex-col items-start gap-3 py-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">
          {gone ? "This task is gone" : "This task didn't load"}
        </h2>
        <p className="text-[13px] text-muted-foreground">
          {gone
            ? "It may have been deleted, maybe in another tab. Pick another task from the list."
            : unreachable
              ? "Postdog can't reach the API. Check that it is running, then try again."
              : error instanceof Error
                ? error.message
                : "The API returned an error."}
        </p>
      </div>
      {gone ? (
        <Button variant="outline" size="sm" className="h-10 md:h-8" onClick={onClose}>
          Back to tasks
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="h-10 md:h-8"
          disabled={retrying}
          onClick={onRetry}
        >
          {retrying ? "Trying again…" : "Try again"}
        </Button>
      )}
    </div>
  );
}

/**
 * The selected task. The Tasks page hosts it as a side panel, an overlay sheet or a full page,
 * depending on the width.
 */
export function TaskDetailPanel({ taskId, onClose }: TaskDetailPanelProps) {
  const { data: task, error, isValidating, mutate } = useTask(taskId);
  const { setParams } = useTaskListParams();

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
        {task && <WriteStatusUpdateButton key={task.id} task={task} className="mr-1" />}
        {task && (
          <DeleteTaskButton
            task={task}
            // A deleted subtask leaves its parent open, a deleted task leaves the list.
            onDeleted={() => setParams({ selectedTaskId: task.parentId ?? undefined })}
            className="size-10 text-muted-foreground md:size-8"
          />
        )}
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

      {/* Keyed by task, so another task opens scrolled to the top and with fresh forms. */}
      <div key={taskId} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
        {task ? (
          <TaskDetailBody task={task} />
        ) : error ? (
          <PanelError
            error={error}
            retrying={isValidating}
            onRetry={() => void mutate()}
            onClose={onClose}
          />
        ) : (
          <PanelSkeleton />
        )}
      </div>
    </div>
  );
}
