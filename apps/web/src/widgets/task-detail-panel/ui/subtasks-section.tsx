"use client";

import Link from "next/link";
import { AddSubtaskForm } from "@/features/task-create";
import { DoneToggle } from "@/features/task-edit";
import {
  PriorityIcon,
  subtaskProgress,
  useTaskListParams,
  type SubtaskProgress,
  type TaskDetail,
  type TaskStatus,
} from "@/entities/task";
import { cn } from "@/shared/lib/utils";
import { EmptyNote, PanelSection } from "./panel-section";

/** Finished work fills the bar from the left, then work in progress, then what is left. */
const SEGMENTS: { status: TaskStatus; className: string }[] = [
  { status: "done", className: "bg-status-done" },
  { status: "in_progress", className: "bg-status-in-progress" },
  { status: "todo", className: "bg-muted-foreground/25" },
];

/** One segment per subtask, so the bar can be counted at a glance. */
function ProgressSegments({ progress }: { progress: SubtaskProgress }) {
  return (
    <div aria-hidden className="flex h-1 gap-0.5">
      {SEGMENTS.flatMap(({ status, className }) =>
        Array.from({ length: progress.counts[status] }, (_, index) => (
          <span
            key={`${status}-${index}`}
            className={cn("h-full flex-1 rounded-full", className)}
          />
        )),
      )}
    </div>
  );
}

export function SubtasksSection({ task }: { task: TaskDetail }) {
  const { hrefWith } = useTaskListParams();
  const progress = subtaskProgress(task.subtasks);

  return (
    <PanelSection
      title="Subtasks"
      meta={
        progress.total > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {progress.done} of {progress.total} done
          </span>
        )
      }
    >
      {progress.total > 0 ? (
        <>
          <ProgressSegments progress={progress} />
          <ul className="-mx-1.5 flex flex-col">
            {task.subtasks.map((subtask) => (
              <li key={subtask.id} className="flex items-center rounded-md hover:bg-accent/50">
                <DoneToggle task={subtask} />
                <Link
                  href={hrefWith({ selectedTaskId: subtask.id })}
                  scroll={false}
                  className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-md pr-1.5 pl-1 text-[13px] outline-none focus-visible:ring-1 focus-visible:ring-ring md:h-7"
                >
                  <span className="w-11 shrink-0 text-xs text-muted-foreground tabular-nums">
                    {subtask.identifier}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate",
                      subtask.status === "done" &&
                        "text-muted-foreground line-through decoration-muted-foreground/40",
                    )}
                  >
                    {subtask.title}
                  </span>
                  <PriorityIcon priority={subtask.priority} />
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <EmptyNote>
          No subtasks yet. Break this into steps small enough to finish in one sitting.
        </EmptyNote>
      )}
      <AddSubtaskForm parent={task} />
    </PanelSection>
  );
}
