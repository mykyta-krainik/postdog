"use client";

import { useId } from "react";
import {
  THEME_PREFERENCES,
  useTheme,
  type ResolvedTheme,
  type ThemePreference,
} from "@/shared/lib/theme";
import { cn } from "@/shared/lib/utils";
import { RadioGroup, RadioGroupItem } from "@/shared/ui/radio-group";

const THEME_LABELS: Record<ThemePreference, string> = {
  dark: "Dark",
  light: "Light",
  system: "System",
};

const PREVIEW_ROWS = ["w-3/5", "w-2/5", "w-1/2"];

/** A tiny Postdog window drawn with the theme's own tokens, whatever the page theme is. */
function ThemePreview({ theme, className }: { theme: ResolvedTheme; className?: string }) {
  return (
    <span className={cn(theme, "flex h-full bg-background", className)}>
      <span className="flex w-1/4 flex-col gap-1 border-r border-sidebar-border bg-sidebar p-1.5">
        <span className="h-1.5 w-3/4 rounded-full bg-brand" />
        <span className="mt-1 h-1.5 rounded-full bg-sidebar-accent" />
        <span className="h-1.5 w-4/5 rounded-full bg-sidebar-accent" />
      </span>
      <span className="flex flex-1 flex-col">
        {PREVIEW_ROWS.map((width, index) => (
          <span
            key={width + index}
            className={cn(
              "flex flex-1 items-center gap-1.5 border-b border-border px-2 last:border-b-0",
              index === 1 && "bg-accent",
            )}
          >
            <span className="size-1.5 shrink-0 rounded-full border border-status-in-progress" />
            <span className={cn("h-1.5 rounded-full bg-muted-foreground/45", width)} />
          </span>
        ))}
      </span>
    </span>
  );
}

/** Dark, light or system. Stored in this browser, not in the API. */
export function ThemePicker() {
  const id = useId();
  const { preference, setPreference } = useTheme();

  return (
    <RadioGroup
      value={preference}
      onValueChange={(value) => {
        const next = THEME_PREFERENCES.find((theme) => theme === value);
        if (next) setPreference(next);
      }}
      aria-label="Theme"
      className="grid-cols-3 gap-2 md:gap-3"
    >
      {THEME_PREFERENCES.map((theme) => (
        <label
          key={theme}
          htmlFor={`${id}-${theme}`}
          className="flex cursor-pointer flex-col overflow-hidden rounded-md border border-border hover:border-input has-[[data-state=checked]]:border-brand/70 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/40"
        >
          <span aria-hidden className="relative block h-14 md:h-[72px]">
            {theme === "system" ? (
              <>
                <ThemePreview theme="light" className="absolute inset-0" />
                <ThemePreview
                  theme="dark"
                  className="absolute inset-0 [clip-path:polygon(58%_0,100%_0,100%_100%,42%_100%)]"
                />
              </>
            ) : (
              <ThemePreview theme={theme} />
            )}
          </span>
          <span className="flex h-10 items-center gap-2 border-t border-border px-2.5 md:h-9">
            <RadioGroupItem
              id={`${id}-${theme}`}
              value={theme}
              className="text-brand data-[state=checked]:border-brand [&_svg]:fill-brand"
            />
            <span className="text-[13px] font-medium text-foreground">{THEME_LABELS[theme]}</span>
          </span>
        </label>
      ))}
    </RadioGroup>
  );
}
