"use client";

import { TaskList } from "@/widgets/task-list";
import { DecomposeButton } from "@/features/decompose-tasks";
import { PlanDayButton } from "@/features/plan-day";
import { CreateTaskButton } from "@/features/task-create";
import { TaskFilterSort } from "@/features/task-filter-sort";
import { MyUpdateButton } from "@/features/write-status-update";
import { useTaskListParams } from "@/entities/task";
import { cn } from "@/shared/lib/utils";
import { TaskDetailHost } from "./task-detail-host";
import { TasksHeader } from "./tasks-header";

export function TasksView() {
  const { params, setParams } = useTaskListParams();
  const selectedTaskId = params.selectedTaskId;

  return (
    <div className="flex min-h-0 flex-1">
      <section
        aria-label="Tasks"
        className={cn(
          "flex min-w-0 flex-1 flex-col",
          selectedTaskId !== undefined && "max-md:hidden",
        )}
      >
        <TasksHeader
          action={
            <div className="flex items-center gap-2">
              <MyUpdateButton />
              <DecomposeButton />
              <PlanDayButton />
              <CreateTaskButton />
            </div>
          }
        >
          <TaskFilterSort />
        </TasksHeader>
        <TaskList />
      </section>
      <TaskDetailHost
        taskId={selectedTaskId}
        onClose={() => setParams({ selectedTaskId: undefined }, { history: "push" })}
      />
    </div>
  );
}
