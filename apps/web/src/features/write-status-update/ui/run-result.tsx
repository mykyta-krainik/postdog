"use client";

import type { StatusUpdaterRun } from "@postdog/shared";
import { CircleSlash, MessageSquareText } from "lucide-react";
import Link from "next/link";
import { routes } from "@/shared/config";
import { useDraftStore } from "../model/use-status-update";
import { UpdateResult } from "./update-result";

/**
 * A finished Status updater run opened on its own, such as from the Runs page: the draft to edit
 * and copy, or the question it asked with links to the tasks, where the user adds the notes.
 * Starting another run stays with the button that owns the scope.
 */
export function StatusUpdateRunResult({ run }: { run: StatusUpdaterRun }) {
  const drafts = useDraftStore();
  const output = run.output;

  if (output?.kind === "update") {
    return <UpdateResult key={run.id} run={run} output={output} drafts={drafts} />;
  }

  if (output?.kind === "needs_notes") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex gap-2.5 rounded-md border border-brand/35 bg-brand-soft/60 px-3 py-2.5">
          <MessageSquareText className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-[13px] font-medium">Postdog asked for notes instead of guessing</p>
            <p className="text-[13px] text-muted-foreground wrap-anywhere">{output.question}</p>
          </div>
        </div>
        <ul aria-label="Tasks that need a note" className="-mx-1.5 flex flex-col">
          {output.tasks.map((task) => (
            <li key={task.taskId}>
              <Link
                href={routes.task(task.taskId)}
                className="flex min-h-10 min-w-0 items-center gap-2 rounded-md px-1.5 text-[13px] outline-none hover:bg-accent/50 focus-visible:ring-1 focus-visible:ring-ring md:min-h-8"
              >
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {task.identifier}
                </span>
                <span className="min-w-0 truncate">{task.title}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Add a note on each task, then write the update again from the task or from My update.
        </p>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-md border border-border bg-muted/40 px-3 py-2.5"
    >
      <CircleSlash className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <p className="text-[13px] text-muted-foreground">
        The run finished without a draft. The trace below shows what happened.
      </p>
    </div>
  );
}
