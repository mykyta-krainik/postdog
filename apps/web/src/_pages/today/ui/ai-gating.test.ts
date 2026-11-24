import type { Settings } from "@postdog/shared";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SWRConfig } from "swr";
import { describe, expect, it } from "vitest";
import { PlanDayButton } from "@/features/plan-day";
import { settingsKey } from "@/entities/settings";
import { ApiError } from "@/shared/api";
import { TodayView } from "./today-view";

/** Renders with these settings already loaded, as every page sees them after the first fetch. */
function render(component: ComponentType, aiEnabled: boolean): string {
  const settings: Settings = {
    aiEnabled,
    decompositionMode: "suggest",
    scheduledRunsEnabled: true,
  };
  return renderToStaticMarkup(
    createElement(
      SWRConfig,
      { value: { provider: () => new Map(), fallback: { [settingsKey]: settings } } },
      createElement(component),
    ),
  );
}

/** Renders after the settings request failed. */
function renderFailed(component: ComponentType): string {
  const error = new ApiError(0, "network_error", "Postdog can't reach the API.");
  return renderToStaticMarkup(
    createElement(
      SWRConfig,
      { value: { provider: () => new Map([[settingsKey, { error }]]) } },
      createElement(component),
    ),
  );
}

describe("AI entry points", () => {
  it("shows Plan my day while AI is on", () => {
    expect(render(PlanDayButton, true)).toContain("Plan my day");
  });

  it("hides Plan my day entirely while AI is off", () => {
    expect(render(PlanDayButton, false)).toBe("");
  });

  it("shows the plan area on Today while AI is on", () => {
    const html = render(TodayView, true);
    expect(html).toContain("Loading today&#x27;s plan");
    expect(html).not.toContain("AI is turned off");
  });

  it("replaces Today with a link to Settings while AI is off", () => {
    const html = render(TodayView, false);
    expect(html).toContain("AI is turned off");
    expect(html).toContain('href="/settings"');
    expect(html).not.toContain("Refresh");
    expect(html).not.toContain("Mock AI");
  });

  it("says Today didn't load and offers Try again when the settings fail", () => {
    const html = renderFailed(TodayView);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Today didn&#x27;t load");
    expect(html).toContain("Postdog can&#x27;t reach the API");
    expect(html).toMatch(/<button[^>]*>(Try again|Trying again…)<\/button>/);
  });
});
