"use client";

import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { CreateTaskButton } from "@/features/task-create";
import { useSettings } from "@/entities/settings";
import {
  StatusIcon,
  TASK_STATUS_META,
  TaskRow,
  groupTasksByStatus,
  hasActiveFilters,
  toListTasksQuery,
  useTaskListParams,
  useTasks,
  type TaskStatus,
} from "@/entities/task";
import { ApiError } from "@/shared/api";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { ListMessage, TaskListSkeleton } from "./list-states";

/** Top-level tasks grouped by status. Collapsed groups are local state, everything else is in the URL. */
export function TaskList() {
  const { params, hrefWith, setParams } = useTaskListParams();
  const { aiEnabled } = useSettings();
  const { data, error, mutate } = useTasks(toListTasksQuery(params));
  const [collapsed, setCollapsed] = useState<ReadonlySet<TaskStatus>>(new Set());

  if (error && !data) {
    const unreachable = error instanceof ApiError && error.code === "network_error";
    return (
      <ListMessage
        title="Tasks didn't load"
        action={
          <Button variant="outline" size="sm" className="h-10 md:h-8" onClick={() => void mutate()}>
            Try again
          </Button>
        }
      >
        {unreachable
          ? "Postdog can't reach the API. Check that it is running, then try again."
          : error instanceof Error
            ? error.message
            : "The API returned an error."}
      </ListMessage>
    );
  }

  if (!data) return <TaskListSkeleton />;

  if (data.items.length === 0) {
    if (!hasActiveFilters(params)) {
      return (
        <ListMessage title="A clean slate" action={<CreateTaskButton variant="outline" />}>
          Nothing to fetch yet. Add the first task your team needs to ship.
        </ListMessage>
      );
    }
    const q = params.q.trim();
    return (
      <ListMessage
        title={
          q
            ? `Nothing matches “${q}”`
            : `No ${TASK_STATUS_META[params.status ?? "todo"].label.toLowerCase()} tasks`
        }
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setParams({ status: undefined, q: "" })}
          >
            Clear filters
          </Button>
        }
      >
        Try another search, or clear the filters to see every task.
      </ListMessage>
    );
  }

  const toggle = (status: TaskStatus) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(status)) next.add(status);
      return next;
    });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-8">
      {groupTasksByStatus(data.items).map(({ status, tasks }) => {
        const isCollapsed = collapsed.has(status);
        const headingId = `task-group-${status}`;
        return (
          <section key={status} aria-labelledby={headingId}>
            <h3 id={headingId} className="sticky top-0 z-10">
              <button
                type="button"
                onClick={() => toggle(status)}
                aria-expanded={!isCollapsed}
                className="flex h-10 w-full items-center gap-2 border-b border-border/60 bg-muted/70 px-4 text-left text-[13px] font-medium backdrop-blur outline-none hover:bg-muted focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset md:h-9 md:px-5"
              >
                <ChevronRight
                  className={cn(
                    "size-3.5 text-muted-foreground transition-transform duration-150",
                    !isCollapsed && "rotate-90",
                  )}
                  aria-hidden
                />
                <StatusIcon status={status} />
                <span>{TASK_STATUS_META[status].label}</span>
                <span className="text-muted-foreground tabular-nums">{tasks.length}</span>
              </button>
            </h3>
            {!isCollapsed &&
              tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  href={hrefWith({ selectedTaskId: task.id })}
                  selected={task.id === params.selectedTaskId}
                  aiEnabled={aiEnabled}
                />
              ))}
          </section>
        );
      })}
    </div>
  );
}
