import type { Settings } from "@postdog/shared";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SWRConfig } from "swr";
import { describe, expect, it, vi } from "vitest";
import { notificationKeys } from "@/entities/notification";
import { settingsKey } from "@/entities/settings";
import { TooltipProvider } from "@/shared/ui/tooltip";
import { MobileTopBar } from "./mobile-top-bar";
import { Sidebar } from "./sidebar";

vi.mock("next/navigation", () => ({ usePathname: () => "/tasks" }));

function render(component: ComponentType, aiEnabled: boolean, unreadCount: number): string {
  const settings: Settings = { aiEnabled, decompositionMode: "auto" };
  return renderToStaticMarkup(
    createElement(
      SWRConfig,
      {
        value: {
          provider: () => new Map(),
          fallback: {
            [settingsKey]: settings,
            [notificationKeys.unreadCount()]: { items: [], unreadCount },
          },
        },
      },
      createElement(TooltipProvider, null, createElement(component)),
    ),
  );
}

describe("Inbox in the navigation", () => {
  it("shows the Inbox with its unread count while AI is on", () => {
    const html = render(Sidebar, true, 3);
    expect(html).toContain('href="/inbox"');
    expect(html).toContain('aria-label="3 unread"');
    expect(html).toContain(">3</span>");
  });

  it("caps the badge at 9+", () => {
    expect(render(Sidebar, true, 14)).toContain(">9+</span>");
  });

  it("shows no badge when everything is read", () => {
    const html = render(Sidebar, true, 0);
    expect(html).toContain('href="/inbox"');
    expect(html).not.toContain("unread");
  });

  it("hides the Inbox and its badge entirely while AI is off", () => {
    const html = render(Sidebar, false, 3);
    expect(html).not.toContain('href="/inbox"');
    expect(html).not.toContain("unread");
  });

  it("marks the phone menu button while something is unread", () => {
    expect(render(MobileTopBar, true, 2)).toContain('aria-label="Open menu, 2 unread"');
    expect(render(MobileTopBar, false, 2)).toContain('aria-label="Open menu"');
  });
});
