import type { AgentRunSummary, Settings } from "@postdog/shared";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SWRConfig } from "swr";
import { describe, expect, it, vi } from "vitest";
import { agentRunKeys } from "@/entities/agent-run";
import { notificationKeys } from "@/entities/notification";
import { settingsKey } from "@/entities/settings";
import { TooltipProvider } from "@/shared/ui/tooltip";
import { MobileTopBar } from "./mobile-top-bar";
import { Sidebar } from "./sidebar";

vi.mock("next/navigation", () => ({ usePathname: () => "/tasks" }));

function runningRun(id: number): AgentRunSummary {
  return {
    id,
    agent: "planner",
    mode: null,
    status: "running",
    promptVersion: "V1",
    error: null,
    langfuseTraceId: null,
    usage: null,
    llm: { mode: "mock", model: "mock" },
    startedAt: 1,
    finishedAt: null,
    label: "Plan my day",
  };
}

function render(
  component: ComponentType,
  aiEnabled: boolean,
  unreadCount: number,
  running = 0,
): string {
  const settings: Settings = { aiEnabled, decompositionMode: "auto" };
  const items = Array.from({ length: running }, (_, index) => runningRun(index + 1));
  return renderToStaticMarkup(
    createElement(
      SWRConfig,
      {
        value: {
          provider: () => new Map(),
          fallback: {
            [settingsKey]: settings,
            [notificationKeys.unreadCount()]: { items: [], unreadCount },
            [agentRunKeys.running()]: { items },
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

describe("Runs in the navigation", () => {
  it("puts Runs between Tasks and the Inbox", () => {
    const html = render(Sidebar, true, 0);
    const order = ['href="/tasks"', 'href="/runs"', 'href="/inbox"'].map((href) =>
      html.indexOf(href),
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("counts the runs going now", () => {
    const html = render(Sidebar, true, 0, 2);
    expect(html).toContain("2 runs running");
    expect(html).toContain("animate-spin");
  });

  it("shows no indicator while nothing runs", () => {
    const html = render(Sidebar, true, 0, 0);
    expect(html).toContain('href="/runs"');
    expect(html).not.toContain("running");
  });

  it("hides Runs and its indicator while AI is off", () => {
    const html = render(Sidebar, false, 0, 2);
    expect(html).not.toContain('href="/runs"');
    expect(html).not.toContain("running");
  });

  it("names both reasons for the dot on the phone menu button", () => {
    const html = render(MobileTopBar, true, 2, 1);
    expect(html).toContain('aria-label="Open menu, 2 unread, 1 run running"');
    expect(render(MobileTopBar, true, 0, 1)).toContain('aria-label="Open menu, 1 run running"');
    expect(render(MobileTopBar, false, 0, 1)).toContain('aria-label="Open menu"');
  });
});
