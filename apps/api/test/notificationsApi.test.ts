import {
  apiErrorBodySchema,
  listNotificationsResponseSchema,
  markNotificationReadResponseSchema,
} from "@postdog/shared";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { insertChangeset } from "../src/repositories/changesets";
import { insertNotification } from "../src/repositories/notifications";
import { setNow } from "./helpers";
import { DAY, addRun, addTask, createTestDb } from "./suggestionFixtures";

const NOW = 50 * DAY;

afterEach(() => {
  vi.useRealTimers();
});

function setup() {
  setNow(NOW);
  const db = createTestDb();
  const run = addRun(db);
  const notify = (title: string, createdAt: number) =>
    insertNotification(db, { kind: "conflict", title, runId: run, createdAt });
  return { db, api: request(createApp(db)), run, notify };
}

async function list(api: ReturnType<typeof setup>["api"], query = "") {
  const res = await api.get(`/api/notifications${query}`).expect(200);
  return listNotificationsResponseSchema.parse(res.body);
}

describe("GET /api/notifications", () => {
  it("lists newest first with the unread count", async () => {
    const { api, notify } = setup();
    notify("Oldest", NOW - 2);
    notify("Newest", NOW);
    notify("Middle", NOW - 1);

    const body = await list(api);
    expect(body.items.map((n) => n.title)).toEqual(["Newest", "Middle", "Oldest"]);
    expect(body.unreadCount).toBe(3);
  });

  it("filters unread ones and limits the list, while unreadCount counts every unread one", async () => {
    const { api, notify } = setup();
    const read = notify("Read", NOW - 3);
    notify("Unread 1", NOW - 2);
    notify("Unread 2", NOW - 1);
    notify("Unread 3", NOW);
    await api.post(`/api/notifications/${read.id}/read`).expect(200);

    const unread = await list(api, "?unread=true");
    expect(unread.items.map((n) => n.title)).toEqual(["Unread 3", "Unread 2", "Unread 1"]);
    expect(unread.unreadCount).toBe(3);

    const limited = await list(api, "?limit=2");
    expect(limited.items.map((n) => n.title)).toEqual(["Unread 3", "Unread 2"]);
    expect(limited.unreadCount).toBe(3);

    expect((await list(api, "?unread=false")).items).toHaveLength(4);
  });

  it("embeds the changeset summary of an auto decomposition", async () => {
    const { db, api, run } = setup();
    const task = addTask(db, { title: "Add SSO" });
    const sub = addTask(db, { title: "Write the migration", parentId: task.id });
    const changeset = insertChangeset(db, {
      runId: run,
      ops: [{ type: "create_task", id: sub.id, taskId: task.id }],
      now: NOW,
    });
    insertNotification(db, {
      kind: "auto_decomposition",
      title: "Split 1 task into 1 subtask",
      runId: run,
      changesetId: changeset.id,
      createdAt: NOW,
    });

    const [item] = (await list(api)).items;
    expect(item?.changeset).toEqual({
      id: changeset.id,
      runId: run,
      status: "applied",
      createdAt: NOW,
      tasks: [
        {
          taskId: task.id,
          identifier: task.identifier,
          title: "Add SSO",
          createdSubtasks: 1,
          createdLinks: 0,
          state: "applied",
        },
      ],
      counts: { subtasks: 1, links: 0 },
    });
  });

  it("rejects a bad limit with 400", async () => {
    const { api } = setup();
    const res = await api.get("/api/notifications?limit=0").expect(400);
    expect(apiErrorBodySchema.parse(res.body).error.code).toBe("validation_error");
  });
});

describe("POST /api/notifications/:id/read", () => {
  it("sets readAt once and keeps the first time on a second call", async () => {
    const { api, notify } = setup();
    const saved = notify("PD-7 was skipped", NOW - 5);

    const first = await api.post(`/api/notifications/${saved.id}/read`).expect(200);
    expect(markNotificationReadResponseSchema.parse(first.body)).toEqual({
      ...saved,
      readAt: NOW,
    });

    setNow(NOW + 1000);
    const second = await api.post(`/api/notifications/${saved.id}/read`).expect(200);
    expect(markNotificationReadResponseSchema.parse(second.body).readAt).toBe(NOW);
    expect((await list(api)).unreadCount).toBe(0);
  });

  it("answers 404 for a missing notification", async () => {
    const { api } = setup();
    const res = await api.post("/api/notifications/999/read").expect(404);
    expect(apiErrorBodySchema.parse(res.body).error.code).toBe("not_found");
  });
});
