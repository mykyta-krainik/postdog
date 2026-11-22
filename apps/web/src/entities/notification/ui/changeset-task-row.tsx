import type { ChangesetTaskSummary } from "@postdog/shared";
import Link from "next/link";
import type { ReactNode } from "react";
import { routes } from "@/shared/config";
import { linksChip, subtasksChip } from "../model/describe";
import { ChangesetStateBadge } from "./notification-marks";

const CHIP = "rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground tabular-nums";

/**
 * One task's part of a changeset: the task as a link, what was created under it, its rollback
 * state, and an optional action such as Roll back. A deleted task shows as plain text.
 */
export function ChangesetTaskRow({
  task,
  action,
}: {
  task: ChangesetTaskSummary;
  action?: ReactNode;
}) {
  const name = (
    <>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {task.identifier ?? `#${task.taskId}`}
      </span>
      <span className="min-w-0 truncate">{task.title ?? "Deleted task"}</span>
    </>
  );
  return (
    <li className="flex items-center gap-3 py-2">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {task.title === null ? (
          <span className="flex min-w-0 items-baseline gap-2 text-[13px] text-muted-foreground">
            {name}
          </span>
        ) : (
          <Link
            href={routes.task(task.taskId)}
            className="flex min-h-10 min-w-0 items-center gap-2 rounded-sm md:min-h-6 text-[13px] outline-none hover:underline focus-visible:ring-1 focus-visible:ring-ring"
          >
            {name}
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          {task.createdSubtasks > 0 && (
            <span className={CHIP}>{subtasksChip(task.createdSubtasks)}</span>
          )}
          {task.createdLinks > 0 && <span className={CHIP}>{linksChip(task.createdLinks)}</span>}
          <ChangesetStateBadge state={task.state} />
        </div>
      </div>
      {action}
    </li>
  );
}
