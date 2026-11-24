import type { Settings } from "@postdog/shared";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SWRConfig } from "swr";
import { describe, expect, it } from "vitest";
import { settingsKey } from "@/entities/settings";
import { DecomposeButton } from "../index";

function render(aiEnabled: boolean): string {
  const settings: Settings = {
    aiEnabled,
    decompositionMode: "suggest",
    scheduledRunsEnabled: true,
  };
  return renderToStaticMarkup(
    createElement(
      SWRConfig,
      { value: { provider: () => new Map(), fallback: { [settingsKey]: settings } } },
      createElement(DecomposeButton),
    ),
  );
}

describe("Decompose", () => {
  it("shows in the toolbar while AI is on, labelled for icon-only phones", () => {
    const html = render(true);
    expect(html).toContain("Decompose");
    expect(html).toContain('aria-label="Decompose"');
  });

  it("is hidden, not disabled, while AI is off", () => {
    expect(render(false)).toBe("");
  });
});
