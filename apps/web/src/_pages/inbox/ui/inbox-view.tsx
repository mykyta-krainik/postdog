"use client";

import Link from "next/link";
import { AgentTrace } from "@/widgets/agent-trace";
import { NotificationsInbox } from "@/widgets/notifications-inbox";
import { useSettings } from "@/entities/settings";
import { UnreadCountBadge, useUnreadCount } from "@/entities/notification";
import { routes } from "@/shared/config";
import { Button } from "@/shared/ui/button";
import { LoadError } from "@/shared/ui/load-error";
import { LogoMark } from "@/shared/ui/wordmark";

function InboxHeader({ unread }: { unread?: number }) {
  return (
    <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3 md:px-5">
      <h1 className="flex h-8 items-center text-[15px] font-semibold tracking-[-0.01em]">Inbox</h1>
      <UnreadCountBadge count={unread} />
    </header>
  );
}

const renderTrace = (runId: number) => <AgentTrace runId={runId} defaultOpen />;

/** Every notification comes from an agent, so with AI off the Inbox explains why it is empty. */
export function InboxView() {
  const { settings, aiEnabled, error, isLoading, mutate } = useSettings();
  const unread = useUnreadCount(aiEnabled);

  if (settings && !aiEnabled) {
    return (
      <>
        <InboxHeader />
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <LogoMark className="size-9 opacity-90" />
          <div className="flex max-w-sm flex-col gap-1">
            <h2 className="text-sm font-medium">AI is turned off</h2>
            <p className="text-[13px] text-muted-foreground">
              The Inbox collects what Postdog&apos;s agents did for you. Turn AI on in Settings to
              see it. Your tasks work the same either way.
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="h-10 md:h-8">
            <Link href={routes.settings}>Open Settings</Link>
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <InboxHeader unread={unread} />
      
      {settings ? (
        <div className="min-h-0 flex-1 overflow-y-auto flex items-center justify-center">
          <div className="w-full max-w-[760px]">
            <NotificationsInbox renderTrace={renderTrace} />
          </div>
        </div>
      ) : (
        error && (
          <LoadError
            title="The Inbox didn't load"
            error={error}
            retrying={isLoading}
            onRetry={() => void mutate()}
            className="m-4 max-w-[760px] md:m-5"
          />
        )
      )}
    </>
  );
}
