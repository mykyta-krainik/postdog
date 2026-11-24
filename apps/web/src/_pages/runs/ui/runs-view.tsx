"use client";

import { idSchema } from "@postdog/shared";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { RunsList } from "@/widgets/runs-list";
import { useSettings } from "@/entities/settings";
import { OPEN_RUN_PARAM, routes } from "@/shared/config";
import { Button } from "@/shared/ui/button";
import { LoadError } from "@/shared/ui/load-error";
import { LogoMark } from "@/shared/ui/wordmark";

export function RunsHeader() {
  return (
    <header className="flex shrink-0 items-center border-b border-border px-4 py-3 md:px-5">
      <h1 className="flex h-8 items-center text-[15px] font-semibold tracking-[-0.01em]">Runs</h1>
    </header>
  );
}

/** The open run from ?run=, or undefined for a missing or malformed id. */
export function parseOpenRunId(value: string | null): number | undefined {
  const parsed = idSchema.safeParse(Number(value ?? ""));
  return parsed.success ? parsed.data : undefined;
}

/** Every run is an agent run, so with AI off the page explains why it is empty and links to Settings. */
export function RunsView() {
  const { settings, aiEnabled, error, isLoading, mutate } = useSettings();
  const openRunId = parseOpenRunId(useSearchParams().get(OPEN_RUN_PARAM));

  if (settings && !aiEnabled) {
    return (
      <>
        <RunsHeader />
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <LogoMark className="size-9 opacity-90" />
          <div className="flex max-w-sm flex-col gap-1">
            <h2 className="text-sm font-medium">AI is turned off</h2>
            <p className="text-[13px] text-muted-foreground">
              Runs lists what Postdog&apos;s agents did and are doing. Turn AI on in Settings to see
              it. Your tasks work the same either way.
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
      <RunsHeader />
      {settings ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="w-full max-w-[820px]">
            <RunsList openRunId={openRunId} />
          </div>
        </div>
      ) : (
        error && (
          <LoadError
            title="Runs didn't load"
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
