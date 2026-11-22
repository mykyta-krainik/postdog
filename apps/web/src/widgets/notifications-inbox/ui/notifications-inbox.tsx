"use client";

import type { ReactNode } from "react";
import { useNotifications } from "@/entities/notification";
import { errorMessage } from "@/shared/lib/form-errors";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import { LogoMark } from "@/shared/ui/wordmark";
import { NotificationCard } from "./notification-card";

function Message({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <LogoMark className="size-9 opacity-90" />
      <div className="flex max-w-sm flex-col gap-1">
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
        <p className="text-[13px] text-muted-foreground">{children}</p>
      </div>
      {action}
    </div>
  );
}

function InboxSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the Inbox" className="flex flex-col">
      {["w-3/5", "w-1/2", "w-2/3"].map((width) => (
        <div key={width} className="flex gap-3 border-b border-border px-4 py-3.5 md:px-5">
          <Skeleton className="size-4" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className={`h-3.5 ${width}`} />
            <Skeleton className="h-3 w-11/12" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Notifications, newest first, unread ones marked. Mount it only while AI is on.
 * `renderTrace` shows a failed run's trace, such as the agent-trace widget.
 */
export function NotificationsInbox({ renderTrace }: { renderTrace: (runId: number) => ReactNode }) {
  const { data, error, isValidating, mutate } = useNotifications();

  if (!data) {
    if (!error) return <InboxSkeleton />;
    return (
      <Message
        title="The Inbox didn't load"
        action={
          <Button
            variant="outline"
            size="sm"
            className="h-10 md:h-8"
            disabled={isValidating}
            onClick={() => void mutate()}
          >
            {isValidating ? "Trying again…" : "Try again"}
          </Button>
        }
      >
        {errorMessage(error, "The API returned an error.")}
      </Message>
    );
  }

  if (data.items.length === 0) {
    return (
      <Message title="Nothing needs you right now">
        Postdog lets you know here when an auto run changes your tasks or an agent needs you.
      </Message>
    );
  }

  return (
    <ul aria-label="Notifications" className="flex flex-col">
      {data.items.map((notification) => (
        <li key={notification.id}>
          <NotificationCard notification={notification} renderTrace={renderTrace} />
        </li>
      ))}
    </ul>
  );
}
