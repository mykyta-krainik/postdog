import type { Settings } from "@postdog/shared";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SWRConfig } from "swr";
import { describe, expect, it } from "vitest";
import { settingsKey } from "@/entities/settings";
import { MyUpdateButton, WriteStatusUpdateButton } from "../index";

function render(element: ReactElement, aiEnabled: boolean): string {
  const settings: Settings = {
    aiEnabled,
    decompositionMode: "suggest",
    scheduledRunsEnabled: true,
  };
  return renderToStaticMarkup(
    createElement(
      SWRConfig,
      { value: { provider: () => new Map(), fallback: { [settingsKey]: settings } } },
      element,
    ),
  );
}

const task = { id: 12, identifier: "PD-12", title: "Fix the login redirect" };

describe("status update entry points", () => {
  it("show while AI is on", () => {
    expect(render(createElement(WriteStatusUpdateButton, { task }), true)).toContain(
      "Write status update",
    );
    expect(render(createElement(MyUpdateButton), true)).toContain("My update");
  });

  it("are hidden, not disabled, while AI is off", () => {
    expect(render(createElement(WriteStatusUpdateButton, { task }), false)).toBe("");
    expect(render(createElement(MyUpdateButton), false)).toBe("");
  });
});
