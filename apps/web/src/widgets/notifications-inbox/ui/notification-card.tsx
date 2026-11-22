"use client";

import type { Notification } from "@postdog/shared";
import { useRef, type ReactNode } from "react";
import { toast } from "sonner";
import {
  NotificationKindIcon,
  UnreadDot,
  isUnread,
  markNotificationRead,
  notificationTitle,
} from "@/entities/notification";
import { formatDateTime, formatRelativeTime } from "@/shared/lib/format";
import { errorMessage } from "@/shared/lib/form-errors";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { AutoDecompositionDetails } from "./auto-decomposition-details";
import { ConflictTasks, FailedRunTrace } from "./run-details";

function KindDetails({
  notification,
  renderTrace,
}: {
  notification: Notification;
  renderTrace: (runId: number) => ReactNode;
}) {
  const { kind, runId, changeset } = notification;
  if (kind === "auto_decomposition") {
    return changeset ? <AutoDecompositionDetails changeset={changeset} /> : null;
  }
  if (runId === null) return null;
  if (kind === "agent_failed") return <FailedRunTrace runId={runId} renderTrace={renderTrace} />;
  return <ConflictTasks runId={runId} />;
}

/**
 * One Inbox entry. Any click inside an unread entry marks it read, so opening a task, expanding
 * the trace or rolling back counts as reading it. "Mark as read" does it without leaving.
 */
export function NotificationCard({
  notification,
  renderTrace,
}: {
  notification: Notification;
  renderTrace: (runId: number) => ReactNode;
}) {
  const unread = isUnread(notification);
  const marking = useRef(false);

  function markRead() {
    if (!unread || marking.current) return;
    marking.current = true;
    markNotificationRead(notification.id)
      .catch((error: unknown) => {
        toast.error("Couldn't mark it as read", {
          description: errorMessage(error, "The API didn't answer. Try again."),
        });
      })
      .finally(() => {
        marking.current = false;
      });
  }

  return (
    <article
      aria-label={notificationTitle(notification)}
      data-unread={unread}
      onClickCapture={markRead}
      className={cn(
        "flex min-w-0 flex-col gap-2 border-b border-border px-4 py-3.5 md:px-5",
        unread && "bg-brand-soft/30",
      )}
    >
      <header className="flex min-w-0 items-start gap-2.5">
        <span className="mt-0.5 flex h-4 w-2 shrink-0 items-center">{unread && <UnreadDot />}</span>
        <NotificationKindIcon kind={notification.kind} className="mt-0.5" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2
            className={cn(
              "text-[13px] leading-5 wrap-anywhere",
              unread ? "font-semibold" : "font-medium",
            )}
          >
            {notificationTitle(notification)}
          </h2>
          {notification.body && (
            <p className="text-[13px] leading-5 text-muted-foreground wrap-anywhere">
              {notification.body}
            </p>
          )}
        </div>
        <time
          dateTime={new Date(notification.createdAt).toISOString()}
          title={formatDateTime(notification.createdAt)}
          className="shrink-0 pt-0.5 text-xs text-muted-foreground tabular-nums"
        >
          {formatRelativeTime(notification.createdAt)}
        </time>
      </header>
      <div className="flex min-w-0 flex-col gap-2 pl-11">
        <KindDetails notification={notification} renderTrace={renderTrace} />
        {unread && (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 h-10 self-start px-2 text-[13px] text-muted-foreground md:h-8"
            onClick={markRead}
          >
            Mark as read
          </Button>
        )}
      </div>
    </article>
  );
}
