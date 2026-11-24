import {
  listNotificationsResponseSchema,
  type ListNotificationsResponse,
  type Settings,
} from "@postdog/shared";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SWRConfig } from "swr";
import { describe, expect, it } from "vitest";
import { notificationKeys } from "@/entities/notification";
import { settingsKey } from "@/entities/settings";
import { NotificationsInbox } from "../index";

const changeset = {
  id: 7,
  runId: 41,
  status: "partially_rolled_back",
  createdAt: 1,
  counts: { subtasks: 5, links: 1 },
  tasks: [
    {
      taskId: 12,
      identifier: "PD-12",
      title: "Rate limits",
      createdSubtasks: 3,
      createdLinks: 1,
      state: "applied",
    },
    {
      taskId: 15,
      identifier: "PD-15",
      title: "Billing page",
      createdSubtasks: 2,
      createdLinks: 0,
      state: "partially_rolled_back",
    },
  ],
};

const base = { runId: 41, changesetId: null, changeset: null, readAt: null, createdAt: 1 };

const list = listNotificationsResponseSchema.parse({
  unreadCount: 3,
  items: [
    {
      ...base,
      id: 4,
      kind: "run_finished",
      title: "Your status update is ready",
      body: "The draft for PD-7 is waiting on the Runs page.",
      runId: 52,
    },
    {
      ...base,
      id: 3,
      kind: "auto_decomposition",
      title: "Split 2 tasks into 5 subtasks",
      body: "Linked 2 related tasks. 1 task needs your answers.",
      changesetId: 7,
      changeset,
    },
    {
      ...base,
      id: 2,
      kind: "agent_failed",
      title: "The Planner failed",
      body: "It hit the step limit.",
      readAt: 5,
    },
    { ...base, id: 1, kind: "conflict", title: "Skipped PD-7", body: "PD-7 was edited." },
  ],
});

function render(data: ListNotificationsResponse): string {
  const settings: Settings = { aiEnabled: true, decompositionMode: "auto" };
  return renderToStaticMarkup(
    createElement(
      SWRConfig,
      {
        value: {
          provider: () => new Map(),
          fallback: { [settingsKey]: settings, [notificationKeys.list()]: data },
        },
      },
      createElement(NotificationsInbox, { renderTrace: () => null }),
    ),
  );
}

describe("NotificationsInbox", () => {
  it("lists every kind newest first and marks the unread ones", () => {
    const html = render(list);
    const order = [
      "Your status update is ready",
      "Split 2 tasks",
      "The Planner failed",
      "Skipped PD-7",
    ].map((title) => html.indexOf(title));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(html.match(/data-unread="true"/g)).toHaveLength(3);
    expect(html.match(/>Unread</g)).toHaveLength(3);
    expect(html.match(/Mark as read/g)).toHaveLength(3);
  });

  it("lists an auto run's tasks as links with what it created and their state", () => {
    const html = render(list);
    expect(html).toContain('href="/tasks?task=12"');
    expect(html).toContain('href="/tasks?task=15"');
    expect(html).toContain("3 subtasks");
    expect(html).toContain("1 link");
    expect(html).toContain("Applied");
    expect(html).toContain("Some edits kept");
  });

  it("offers Roll back only for the untouched task, and Roll back everything", () => {
    const html = render(list);
    expect(html).toContain('aria-label="Roll back PD-12"');
    expect(html).not.toContain('aria-label="Roll back PD-15"');
    expect(html).toContain("Roll back everything");
  });

  it("hides Roll back everything once nothing can roll back", () => {
    const auto = list.items.find((item) => item.kind === "auto_decomposition");
    const done = {
      ...auto!,
      changeset: {
        ...changeset,
        status: "rolled_back" as const,
        tasks: changeset.tasks.map((task) => ({ ...task, state: "rolled_back" as const })),
      },
    };
    const html = render({ unreadCount: 0, items: [done] });
    expect(html).not.toContain("Roll back");
    expect(html).toContain("Everything this run created was removed.");
  });

  it("links a finished run to its result on the Runs page", () => {
    const html = render(list);
    expect(html).toContain("The draft for PD-7 is waiting on the Runs page.");
    expect(html).toContain('href="/runs?run=52"');
    expect(html).toContain("Open result");
    // Only the failed run offers its trace.
    expect(html.match(/Show trace of run/g)).toHaveLength(1);
  });

  it("offers a failed run's trace", () => {
    expect(render(list)).toContain("Show trace of run #41");
  });

  it("says so when nothing needs the user", () => {
    expect(render({ unreadCount: 0, items: [] })).toContain("Nothing needs you right now");
  });
});
