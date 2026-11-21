"use client";

import Link from "next/link";
import { TodayFocus } from "@/widgets/today-focus";
import { useSettings } from "@/entities/settings";
import { routes } from "@/shared/config";
import { Button } from "@/shared/ui/button";
import { LogoMark } from "@/shared/ui/wordmark";

/** Today needs the Planner, so with AI off it explains why it is empty and links to Settings. */
export function TodayView() {
  const { settings, aiEnabled } = useSettings();

  if (settings && !aiEnabled) {
    return (
      <>
        <header className="flex shrink-0 items-center border-b border-border px-4 py-3 md:px-5">
          <h1 className="flex h-8 items-center text-[15px] font-semibold tracking-[-0.01em]">
            Today
          </h1>
        </header>
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <LogoMark className="size-9 opacity-90" />
          <div className="flex max-w-sm flex-col gap-1">
            <h2 className="text-sm font-medium">AI is turned off</h2>
            <p className="text-[13px] text-muted-foreground">
              Today shows the plan Postdog&apos;s Planner makes for you. Turn AI on in Settings to
              use it. Your tasks work the same either way.
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="h-10 md:h-8">
            <Link href={routes.settings}>Open Settings</Link>
          </Button>
        </div>
      </>
    );
  }

  if (!settings) {
    return (
      <header className="flex shrink-0 items-center border-b border-border px-4 py-3 md:px-5">
        <h1 className="flex h-8 items-center text-[15px] font-semibold tracking-[-0.01em]">
          Today
        </h1>
      </header>
    );
  }

  return <TodayFocus />;
}
