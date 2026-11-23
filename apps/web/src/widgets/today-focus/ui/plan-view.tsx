"use client";

import { AlertTriangle, History, Users } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  TraceTimeline,
  revalidatePlannerLatest,
  type CompletedPlannerRun,
} from "@/entities/agent-run";
import { updateTask } from "@/entities/task";
import { formatDateTime, formatDayTime } from "@/shared/lib/format";
import { errorMessage } from "@/shared/lib/form-errors";
import { Button } from "@/shared/ui/button";
import {
  changedSinceText,
  readPlanMarks,
  unexplainedChanges,
  writePlanMarks,
  type PlanMarks,
} from "../model/plan-marks";
import { FocusItem } from "./focus-item";

function NoteList({
  icon,
  label,
  items,
  className,
}: {
  icon: ReactNode;
  label: string;
  items: readonly string[];
  className: string;
}) {
  return (
    <section
      aria-label={label}
      className={`mx-4 flex gap-2.5 rounded-md border px-3 py-2 md:mx-5 ${className}`}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <ul className="flex min-w-0 flex-col gap-1 text-[13px] leading-5">
        {items.map((text, index) => (
          <li key={index}>{text}</li>
        ))}
      </ul>
    </section>
  );
}

/** The latest plan. Dismissed and started items are remembered per plan in this browser. */
export function PlanView({
  run,
  changedSince,
  onRefresh,
}: {
  run: CompletedPlannerRun;
  changedSince: number;
  onRefresh: () => void;
}) {
  const [marks, setMarks] = useState<PlanMarks>(() => readPlanMarks(run.id));
  const { focus, warnings, coordinationNotes } = run.output;
  const stale = changedSinceText(unexplainedChanges(changedSince, marks));
  const visible = focus.filter((item) => !marks.dismissed.includes(item.taskId));

  function save(next: (current: PlanMarks) => PlanMarks) {
    setMarks((current) => {
      const updated = next(current);
      writePlanMarks(run.id, updated);
      return updated;
    });
  }

  function start(taskId: number, identifier: string) {
    save((current) => ({ ...current, started: [...current.started, taskId] }));
    updateTask(taskId, { status: "in_progress" }).then(
      () => revalidatePlannerLatest(),
      (error: unknown) => {
        save((current) => ({ ...current, started: current.started.filter((id) => id !== taskId) }));
        toast.error(`${identifier} didn't start`, {
          description: errorMessage(error, "Try again."),
        });
      },
    );
  }

  return (
    <div className="flex flex-col gap-3 pb-8">
      {coordinationNotes.length > 0 && (
        <NoteList
          icon={<Users className="size-4 text-muted-foreground" aria-hidden />}
          label="Coordination notes"
          items={coordinationNotes}
          className="border-border bg-muted/40 text-foreground"
        />
      )}
      {warnings.length > 0 && (
        <NoteList
          icon={<AlertTriangle className="size-4 text-brand" aria-hidden />}
          label="Warnings"
          items={warnings.map((warning) => warning.message)}
          className="border-brand/30 bg-brand-soft/50 text-foreground"
        />
      )}

      <section aria-labelledby="today-focus-heading" className="flex flex-col">
        <div className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-1.5 md:px-5">
          <h2 id="today-focus-heading" className="text-[13px] font-medium">
            Start with these
          </h2>
          <time
            dateTime={new Date(run.finishedAt).toISOString()}
            title={formatDateTime(run.finishedAt)}
            className="text-xs text-muted-foreground tabular-nums"
          >
            Planned {formatDayTime(run.finishedAt)}
          </time>
          {stale && (
            <button
              type="button"
              onClick={onRefresh}
              className="flex h-10 items-center gap-1.5 rounded-md px-1.5 text-xs text-brand-text outline-none hover:bg-brand-soft focus-visible:ring-1 focus-visible:ring-ring md:h-6"
            >
              <History className="size-3.5" aria-hidden />
              {stale}
            </button>
          )}
        </div>

        {visible.length === 0 ? (
          <div className="flex flex-col items-start gap-2 px-4 py-6 md:px-5">
            <p className="text-[13px] text-foreground">You cleared today&apos;s plan.</p>
            <p className="text-[13px] text-muted-foreground">
              Plan again when you are ready for the next thing.
            </p>
          </div>
        ) : (
          <ol aria-labelledby="today-focus-heading">
            {visible.map((item) => (
              <FocusItem
                key={item.taskId}
                item={item}
                rank={focus.indexOf(item) + 1}
                started={marks.started.includes(item.taskId)}
                onStart={() => start(item.taskId, item.identifier)}
                onDismiss={() =>
                  save((current) => ({
                    ...current,
                    dismissed: [...current.dismissed, item.taskId],
                  }))
                }
              />
            ))}
          </ol>
        )}

        {marks.dismissed.length > 0 && (
          <div className="px-4 pt-2 md:px-5">
            <Button
              variant="ghost"
              size="sm"
              className="h-10 px-2 text-xs text-muted-foreground md:h-7"
              onClick={() => save((current) => ({ ...current, dismissed: [] }))}
            >
              Show {marks.dismissed.length} dismissed
            </Button>
          </div>
        )}
      </section>

      <TraceTimeline
        trace={run.trace}
        title="How Postdog chose these"
        className="mx-2.5 md:mx-3.5"
      />
    </div>
  );
}
