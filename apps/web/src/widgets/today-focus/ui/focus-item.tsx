"use client";

import { Check, X } from "lucide-react";
import Link from "next/link";
import { SuggestedBadge, type PlannerFocusItem } from "@/entities/agent-run";
import { PriorityIcon, StatusIcon, useTask } from "@/entities/task";
import { routes } from "@/shared/config";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";

/**
 * One recommended task: its rank, the task as it is now, the Planner's reason and signals,
 * and Start or Dismiss. The task loads by id, so a status changed since the plan shows.
 */
export function FocusItem({
  item,
  rank,
  started,
  onStart,
  onDismiss,
}: {
  item: PlannerFocusItem;
  rank: number;
  started: boolean;
  onStart: () => void;
  onDismiss: () => void;
}) {
  const { data: task, error } = useTask(item.taskId);
  const gone = !task && error !== undefined;
  const canStart = !started && !gone && (task === undefined || task.status === "todo");

  return (
    <li className="flex gap-3 border-b border-border/60 py-3 pr-2 pl-4 md:gap-4 md:pr-3 md:pl-5">
      <span
        aria-hidden
        className="w-4 shrink-0 pt-0.5 text-right text-[15px] leading-6 font-semibold text-brand tabular-nums"
      >
        {rank}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex h-6 min-w-0 items-center gap-2">
          {task ? (
            <>
              <PriorityIcon priority={task.priority} />
              <StatusIcon status={task.status} />
            </>
          ) : gone ? null : (
            <Skeleton className="h-3.5 w-8" />
          )}
          <Link
            href={routes.task(item.taskId)}
            className="flex min-w-0 items-center gap-2 rounded-sm text-[13px] outline-none hover:underline focus-visible:ring-1 focus-visible:ring-ring"
          >
            <span className="shrink-0 text-muted-foreground tabular-nums">{item.identifier}</span>
            <span className="min-w-0 truncate font-medium text-foreground">
              {task?.title ?? item.title}
            </span>
          </Link>
          {started ? (
            <Badge
              variant="outline"
              className="border-status-in-progress/40 font-normal text-status-in-progress"
            >
              <Check aria-hidden />
              Started
            </Badge>
          ) : (
            <SuggestedBadge className="max-sm:hidden" />
          )}
        </div>
        <p className="text-[13px] leading-5 text-muted-foreground">
          {gone ? "This task no longer exists. " : null}
          {item.reason}
        </p>
        {item.signals.length > 0 && (
          <ul aria-label="Signals" className="flex flex-wrap gap-1.5 pt-0.5">
            {item.signals.map((signal) => (
              <li
                key={signal}
                className="rounded-sm border border-border bg-muted/50 px-1.5 py-px text-xs text-muted-foreground"
              >
                {signal}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex shrink-0 items-start gap-1">
        {canStart && (
          <Button
            variant="outline"
            size="sm"
            className="h-10 px-3 text-[13px] md:h-8"
            onClick={onStart}
          >
            Start
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="size-10 text-muted-foreground md:size-8"
          aria-label={`Dismiss ${item.identifier}`}
          title="Dismiss"
          onClick={onDismiss}
        >
          <X className="size-4" aria-hidden />
        </Button>
      </div>
    </li>
  );
}
