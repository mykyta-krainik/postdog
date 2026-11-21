"use client";

import type { ReactNode } from "react";
import { DecompositionModeSetting } from "@/features/set-decomposition-mode";
import { AiToggle } from "@/features/toggle-ai";
import { useSettings } from "@/entities/settings";
import { ApiError } from "@/shared/api";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import { ThemePicker } from "./theme-picker";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-[13px] font-semibold text-foreground">{title}</h2>
        {description && <p className="text-[13px] text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

const GROUP = "divide-y divide-border overflow-hidden rounded-md border border-border bg-card";

function SettingsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading settings" className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3.5 w-10" />
        <div className={GROUP}>
          {["w-24", "w-28"].map((width) => (
            <div key={width} className="flex flex-col gap-2 px-4 py-4">
              <Skeleton className={`h-3 ${width}`} />
              <Skeleton className="h-3 w-4/5" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3.5 w-24" />
        <div className="grid grid-cols-3 gap-2 md:gap-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-24 md:h-[108px]" />
          ))}
        </div>
      </div>
    </div>
  );
}

function SettingsError({
  error,
  retrying,
  onRetry,
}: {
  error: unknown;
  retrying: boolean;
  onRetry: () => void;
}) {
  const unreachable = error instanceof ApiError && error.code === "network_error";
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-md border border-border px-4 py-4"
    >
      <div className="flex flex-col gap-1">
        <p className="text-[13px] font-medium text-foreground">AI settings didn&apos;t load</p>
        <p className="text-[13px] leading-5 text-muted-foreground">
          {unreachable
            ? "Postdog can't reach the API. Check that it is running, then try again."
            : error instanceof Error
              ? error.message
              : "The API returned an error."}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onRetry}
        disabled={retrying}
        className="max-md:h-10"
      >
        {retrying ? "Trying again…" : "Try again"}
      </Button>
    </div>
  );
}

/**
 * The whole page waits for the first settings response, so the theme picker mounts after
 * hydration and never shows the server's default theme first.
 */
export function SettingsView() {
  const { settings, error, isLoading, mutate } = useSettings();

  if (!settings && !error) return <SettingsSkeleton />;

  return (
    <div className="flex flex-col gap-8">
      <Section title="AI">
        {settings ? (
          <div className={GROUP}>
            <AiToggle enabled={settings.aiEnabled} />
            {settings.aiEnabled && <DecompositionModeSetting mode={settings.decompositionMode} />}
          </div>
        ) : (
          <SettingsError error={error} retrying={isLoading} onRetry={() => void mutate()} />
        )}
      </Section>
      <Section title="Appearance" description="Your theme is saved in this browser.">
        <ThemePicker />
      </Section>
    </div>
  );
}
