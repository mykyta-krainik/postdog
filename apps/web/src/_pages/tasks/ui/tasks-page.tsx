import type { Metadata } from "next";
import { Suspense } from "react";
import { TaskListSkeleton } from "@/widgets/task-list";
import { TasksHeader } from "./tasks-header";
import { TasksView } from "./tasks-view";

export const metadata: Metadata = { title: "Tasks" };

/** The list state lives in search params, which only the client reads, so the view renders inside Suspense. */
export function TasksPage() {
  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <Suspense
        fallback={
          <>
            <TasksHeader />
            <TaskListSkeleton />
          </>
        }
      >
        <TasksView />
      </Suspense>
    </main>
  );
}
