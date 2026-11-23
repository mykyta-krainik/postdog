import {
  acceptSuggestionResponseSchema,
  apiErrorBodySchema,
  listSuggestionsResponseSchema,
  rejectSuggestionResponseSchema,
  validationErrorDetailsSchema,
  type SubtasksPayload,
} from "@postdog/shared";
import type { Response } from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { getSetting } from "../src/repositories/settings";
import {
  findSuggestion,
  insertSuggestion,
  listTaskIdsInCooldown,
  resolveSuggestion,
} from "../src/repositories/suggestions";
import { findTask, insertTask, listSubtaskIds } from "../src/repositories/tasks";
import { getTask, jsonClient, setNow } from "./helpers";
import {
  DAY,
  addRun,
  addTask,
  aiStateOf,
  clarificationFor,
  createTestDb,
  relatedOf,
  subtasksFor,
} from "./suggestionFixtures";

const NOW = 50 * DAY;
const LATER = NOW + 10;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function setup() {
  setNow(NOW);
  const db = createTestDb();
  return { db, api: jsonClient(createApp(db)), run: addRun(db) };
}

const errorOf = (res: Response) => apiErrorBodySchema.parse(res.body).error;
const issuePaths = (res: Response) =>
  validationErrorDetailsSchema.parse(errorOf(res).details).issues.map((issue) => issue.path);
const accepted = (res: Response) => acceptSuggestionResponseSchema.parse(res.body);

function threeSubtasks(): SubtasksPayload {
  return {
    subtasks: ["Design", "Build", "Ship"].map((title) => ({ title, description: "" })),
    rationale: "Three steps",
  };
}

describe("GET /api/suggestions", () => {
  it("lists pending suggestions oldest first and filters by task, status and type", async () => {
    const { db, api, run } = setup();
    const [a, b, c] = [addTask(db), addTask(db), addTask(db)];
    const related = insertSuggestion(db, relatedOf(run, [a.id, b.id], NOW + 2));
    const forB = insertSuggestion(db, subtasksFor(run, b.id, NOW + 1));
    const forC = insertSuggestion(db, clarificationFor(run, c.id, NOW + 3));
    const rejected = resolveSuggestion(db, forC.id, "rejected", NOW + 4);

    const list = async (query: string) =>
      listSuggestionsResponseSchema.parse(
        (await api.get(`/api/suggestions${query}`).expect(200)).body,
      ).items;
    expect(await list("")).toEqual([forB, related]);
    expect(await list(`?targetType=task&targetId=${b.id}`)).toEqual([forB, related]);
    expect(await list(`?targetId=${a.id}`)).toEqual([related]);
    expect(await list(`?targetId=${c.id}`)).toEqual([]);
    expect(await list(`?targetId=${c.id}&status=rejected`)).toEqual([rejected]);
    expect(await list("?targetType=doc")).toEqual([]);

    const bad = await api.get("/api/suggestions?status=open").expect(400);
    expect(errorOf(bad).code).toBe("validation_error");
  });
});

describe("POST /api/suggestions/:id/accept, subtasks", () => {
  it("creates todo subtasks, applies the suggestion and keeps the parent's updatedAt", async () => {
    const { db, api, run } = setup();
    const parent = addTask(db, { title: "Parent" });
    const suggestion = insertSuggestion(db, subtasksFor(run, parent.id, NOW + 1));
    setNow(LATER);

    const body = accepted(
      await api
        .post(`/api/suggestions/${suggestion.id}/accept`)
        .send({ baseUpdatedAt: parent.updatedAt })
        .expect(200),
    );
    expect(body.suggestion).toEqual({ ...suggestion, status: "applied", resolvedAt: LATER });
    expect(body.createdLinks).toEqual([]);
    expect(body.createdTasks).toMatchObject([
      { title: "Write the migration", priority: "medium", status: "todo", parentId: parent.id },
      { title: "Add tests", priority: "high", status: "todo", parentId: parent.id },
    ]);
    expect(body.createdTasks.every((t) => t.createdAt === LATER && t.updatedAt === LATER)).toBe(
      true,
    );

    const detail = await getTask(api, parent.id);
    expect(detail.subtasks.map((s) => s.id)).toEqual(body.createdTasks.map((t) => t.id));
    expect(detail).toMatchObject({ updatedAt: NOW, aiState: "none", pendingSuggestions: [] });
  });

  it("creates and stores the user's edited payload", async () => {
    const { db, api, run } = setup();
    const parent = addTask(db);
    const suggestion = insertSuggestion(db, subtasksFor(run, parent.id, NOW + 1));
    const edited = {
      subtasks: [
        { title: "  Draft the schema " },
        { title: "Migrate", description: "Run it", priority: "low" },
        { title: "Test" },
      ],
      rationale: "Edited",
    };

    const body = accepted(
      await api
        .post(`/api/suggestions/${suggestion.id}/accept`)
        .send({ payload: edited, baseUpdatedAt: parent.updatedAt })
        .expect(200),
    );
    expect(body.createdTasks.map((t) => [t.title, t.description, t.priority])).toEqual([
      ["Draft the schema", "", "medium"],
      ["Migrate", "Run it", "low"],
      ["Test", "", "medium"],
    ]);
    expect(findSuggestion(db, suggestion.id)?.payload).toEqual({
      subtasks: [
        { title: "Draft the schema", description: "" },
        { title: "Migrate", description: "Run it", priority: "low" },
        { title: "Test", description: "" },
      ],
      rationale: "Edited",
    });
  });

  it("answers 400 with payload paths for an invalid edit and changes nothing", async () => {
    const { db, api, run } = setup();
    const parent = addTask(db);
    const suggestion = insertSuggestion(db, subtasksFor(run, parent.id, NOW + 1));

    const res = await api
      .post(`/api/suggestions/${suggestion.id}/accept`)
      .send({
        payload: { subtasks: [{ title: " " }, { title: "Fine" }], rationale: "x" },
        baseUpdatedAt: parent.updatedAt,
      })
      .expect(400);
    expect(errorOf(res).code).toBe("validation_error");
    expect(issuePaths(res)).toEqual(["payload.subtasks.0.title"]);
    expect(findSuggestion(db, suggestion.id)?.status).toBe("pending");
    expect(listSubtaskIds(db, parent.id)).toEqual([]);
  });

  it("answers 409 stale and changes nothing when the task changed", async () => {
    const { db, api, run } = setup();
    const parent = addTask(db);
    const suggestion = insertSuggestion(db, subtasksFor(run, parent.id, NOW + 1));
    setNow(NOW + 5);
    await api.patch(`/api/tasks/${parent.id}`).send({ title: "Edited" }).expect(200);

    const res = await api
      .post(`/api/suggestions/${suggestion.id}/accept`)
      .send({ baseUpdatedAt: parent.updatedAt })
      .expect(409);
    expect(errorOf(res).code).toBe("stale");
    expect(findSuggestion(db, suggestion.id)?.status).toBe("pending");
    expect(listSubtaskIds(db, parent.id)).toEqual([]);
    expect(aiStateOf(db, parent.id)).toBe("suggestion_pending");
  });

  it("answers 409 conflict to a second accept or reject, and 404 to an unknown id", async () => {
    const { db, api, run } = setup();
    const parent = addTask(db);
    const suggestion = insertSuggestion(db, subtasksFor(run, parent.id, NOW + 1));
    const body = { baseUpdatedAt: parent.updatedAt };
    await api.post(`/api/suggestions/${suggestion.id}/accept`).send(body).expect(200);

    const again = await api.post(`/api/suggestions/${suggestion.id}/accept`).send(body).expect(409);
    expect(errorOf(again).code).toBe("conflict");
    const reject = await api.post(`/api/suggestions/${suggestion.id}/reject`).expect(409);
    expect(errorOf(reject).code).toBe("conflict");
    expect(listSubtaskIds(db, parent.id)).toHaveLength(2);

    const missing = await api.post("/api/suggestions/999/accept").send(body).expect(404);
    expect(errorOf(missing).code).toBe("not_found");
  });

  it("answers 400 naming the item whose title an existing subtask already has", async () => {
    const { db, api, run } = setup();
    const parent = addTask(db);
    const existing = addTask(db, { title: "add TESTS", parentId: parent.id });
    const suggestion = insertSuggestion(db, subtasksFor(run, parent.id, NOW + 1));

    const res = await api
      .post(`/api/suggestions/${suggestion.id}/accept`)
      .send({ baseUpdatedAt: parent.updatedAt })
      .expect(400);
    expect(errorOf(res).code).toBe("validation_error");
    expect(issuePaths(res)).toEqual(["payload.subtasks.1.title"]);
    expect(listSubtaskIds(db, parent.id)).toEqual([existing.id]);
    expect(findSuggestion(db, suggestion.id)?.status).toBe("pending");
  });

  it("answers 400 naming the item whose title repeats one earlier in the proposal", async () => {
    const { db, api, run } = setup();
    const parent = addTask(db);
    const suggestion = insertSuggestion(db, subtasksFor(run, parent.id, NOW + 1));

    const res = await api
      .post(`/api/suggestions/${suggestion.id}/accept`)
      .send({
        payload: {
          subtasks: [{ title: "Ship it" }, { title: "Test" }, { title: " ship IT " }],
          rationale: "x",
        },
        baseUpdatedAt: parent.updatedAt,
      })
      .expect(400);
    expect(issuePaths(res)).toEqual(["payload.subtasks.2.title"]);
    expect(listSubtaskIds(db, parent.id)).toEqual([]);
  });

  it("answers 409 conflict when the task got subtasks after the suggestion", async () => {
    const { db, api, run } = setup();
    const parent = addTask(db);
    const suggestion = insertSuggestion(db, subtasksFor(run, parent.id, NOW + 1));
    setNow(NOW + 5);
    const manual = addTask(db, { title: "Manual", parentId: parent.id });

    const res = await api
      .post(`/api/suggestions/${suggestion.id}/accept`)
      .send({ baseUpdatedAt: parent.updatedAt })
      .expect(409);
    expect(errorOf(res).code).toBe("conflict");
    expect(listSubtaskIds(db, parent.id)).toEqual([manual.id]);
  });

  it("supersedes the task's other subtasks and clarification suggestions, not related ones", async () => {
    const { db, api, run } = setup();
    const parent = addTask(db);
    const other = addTask(db);
    const clarification = insertSuggestion(db, clarificationFor(run, parent.id, NOW + 1));
    const first = insertSuggestion(db, subtasksFor(run, parent.id, NOW + 2));
    const second = insertSuggestion(db, subtasksFor(run, parent.id, NOW + 3));
    const related = insertSuggestion(db, relatedOf(run, [parent.id, other.id], NOW + 4));
    expect(aiStateOf(db, parent.id)).toBe("clarification_pending");

    await api
      .post(`/api/suggestions/${first.id}/accept`)
      .send({ baseUpdatedAt: parent.updatedAt })
      .expect(200);
    expect(findSuggestion(db, clarification.id)?.status).toBe("superseded");
    expect(findSuggestion(db, second.id)?.status).toBe("superseded");
    expect(findSuggestion(db, related.id)?.status).toBe("pending");
    expect(aiStateOf(db, parent.id)).toBe("suggestion_pending");
    expect(aiStateOf(db, other.id)).toBe("suggestion_pending");
  });

  it("saves nothing when creating the third subtask fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { db, api, run } = setup();
    const parent = addTask(db);
    insertTask(db, {
      identifier: "PD-4",
      title: "Holds the third identifier",
      createdAt: NOW,
      updatedAt: NOW,
      statusChangedAt: NOW,
    });
    const clarification = insertSuggestion(db, clarificationFor(run, parent.id, NOW + 1));
    const suggestion = insertSuggestion(db, {
      ...subtasksFor(run, parent.id, NOW + 2),
      kind: "subtasks",
      payload: threeSubtasks(),
    });

    const res = await api
      .post(`/api/suggestions/${suggestion.id}/accept`)
      .send({ baseUpdatedAt: parent.updatedAt })
      .expect(500);
    expect(errorOf(res).code).toBe("internal_error");
    expect(listSubtaskIds(db, parent.id)).toEqual([]);
    expect(getSetting(db, "identifierCounter")).toBe(1);
    expect(findSuggestion(db, suggestion.id)?.status).toBe("pending");
    expect(findSuggestion(db, clarification.id)?.status).toBe("pending");
    expect(aiStateOf(db, parent.id)).toBe("clarification_pending");
  });
});

describe("POST /api/suggestions/:id/accept, related", () => {
  it("links duplicates from the newer task to the older one, as a star on the target", async () => {
    const { db, api, run } = setup();
    setNow(NOW + 5);
    const a = addTask(db, { title: "A" });
    setNow(NOW);
    const b = addTask(db, { title: "B" });
    setNow(NOW + 5);
    const c = addTask(db, { title: "C" });
    const suggestion = insertSuggestion(
      db,
      relatedOf(run, [a.id, b.id, c.id], NOW + 6, "duplicates"),
    );
    setNow(NOW + 7);
    await api.patch(`/api/tasks/${b.id}`).send({ title: "B, edited" }).expect(200);
    setNow(LATER);

    const body = accepted(
      await api
        .post(`/api/suggestions/${suggestion.id}/accept`)
        .send({ baseUpdatedAt: a.updatedAt })
        .expect(200),
    );
    const link = { type: "duplicates", createdBy: `agent:${run}`, createdAt: LATER };
    expect(body.createdLinks).toEqual([
      { id: expect.any(Number), fromTaskId: a.id, toTaskId: b.id, ...link },
      { id: expect.any(Number), fromTaskId: c.id, toTaskId: a.id, ...link },
    ]);
    expect(body.createdTasks).toEqual([]);
    expect(body.suggestion).toMatchObject({ status: "applied", resolvedAt: LATER });
    expect([a, b, c].map((t) => aiStateOf(db, t.id))).toEqual(["none", "none", "none"]);
    expect([a, b, c].map((t) => findTask(db, t.id)?.updatedAt)).toEqual([
      NOW + 5,
      NOW + 7,
      NOW + 5,
    ]);
  });

  it("answers 409 stale when the target task changed", async () => {
    const { db, api, run } = setup();
    const [a, b] = [addTask(db), addTask(db)];
    const suggestion = insertSuggestion(db, relatedOf(run, [a.id, b.id], NOW + 1, "duplicates"));
    setNow(NOW + 5);
    await api.patch(`/api/tasks/${a.id}`).send({ status: "in_progress" }).expect(200);

    const res = await api
      .post(`/api/suggestions/${suggestion.id}/accept`)
      .send({ baseUpdatedAt: a.updatedAt })
      .expect(409);
    expect(errorOf(res).code).toBe("stale");
    expect((await getTask(api, a.id)).links).toEqual([]);
  });

  it("links overlaps with relates and skips a link that already exists", async () => {
    const { db, api, run } = setup();
    const [a, b, c] = [addTask(db), addTask(db), addTask(db)];
    await api
      .post(`/api/tasks/${c.id}/links`)
      .send({ toTaskId: a.id, type: "relates" })
      .expect(201);
    const suggestion = insertSuggestion(db, relatedOf(run, [a.id, b.id, c.id], NOW + 1));

    const body = accepted(
      await api
        .post(`/api/suggestions/${suggestion.id}/accept`)
        .send({ baseUpdatedAt: a.updatedAt })
        .expect(200),
    );
    expect(body.createdLinks).toMatchObject([
      { fromTaskId: a.id, toTaskId: b.id, type: "relates", createdBy: `agent:${run}` },
    ]);
    expect((await getTask(api, a.id)).links.map((l) => [l.task.id, l.type])).toEqual([
      [c.id, "relates"],
      [b.id, "relates"],
    ]);
  });

  it("accepts an edit that drops a task from the group and refuses one that adds a task", async () => {
    const { db, api, run } = setup();
    const [a, b, c, d] = [addTask(db), addTask(db), addTask(db), addTask(db)];
    const suggestion = insertSuggestion(db, relatedOf(run, [a.id, b.id, c.id], NOW + 1));
    const send = (taskIds: number[]) =>
      api.post(`/api/suggestions/${suggestion.id}/accept`).send({
        payload: { relation: "overlaps", taskIds, reason: "Edited" },
        baseUpdatedAt: a.updatedAt,
      });

    for (const taskIds of [
      [a.id, d.id],
      [b.id, c.id],
    ]) {
      const res = await send(taskIds).expect(400);
      expect(issuePaths(res)).toEqual(["payload.taskIds"]);
    }
    const body = accepted(await send([a.id, b.id]).expect(200));
    expect(body.createdLinks).toMatchObject([{ fromTaskId: a.id, toTaskId: b.id }]);
    expect(body.suggestion.payload).toEqual({
      relation: "overlaps",
      taskIds: [a.id, b.id],
      reason: "Edited",
    });
    expect([a, b, c].map((t) => aiStateOf(db, t.id))).toEqual(["none", "none", "none"]);
  });
});

describe("POST /api/suggestions/:id/accept, clarification", () => {
  it("answers 400 and points to the clarify endpoint", async () => {
    const { db, api, run } = setup();
    const task = addTask(db);
    const suggestion = insertSuggestion(db, clarificationFor(run, task.id, NOW + 1));

    const res = await api
      .post(`/api/suggestions/${suggestion.id}/accept`)
      .send({ baseUpdatedAt: task.updatedAt })
      .expect(400);
    expect(errorOf(res).code).toBe("validation_error");
    expect(errorOf(res).message).toContain("POST /api/agents/decomposer/clarify");
    expect(findSuggestion(db, suggestion.id)?.status).toBe("pending");
  });
});

describe("POST /api/suggestions/:id/reject", () => {
  it("rejects the suggestion, clears aiState and starts the 7-day cooldown", async () => {
    const { db, api, run } = setup();
    const [a, b] = [addTask(db), addTask(db)];
    const suggestion = insertSuggestion(db, relatedOf(run, [a.id, b.id], NOW + 1, "duplicates"));
    setNow(LATER);

    const res = await api.post(`/api/suggestions/${suggestion.id}/reject`).expect(200);
    expect(rejectSuggestionResponseSchema.parse(res.body)).toEqual({
      ...suggestion,
      status: "rejected",
      resolvedAt: LATER,
    });
    expect([a, b].map((t) => aiStateOf(db, t.id))).toEqual(["none", "none"]);
    expect(listTaskIdsInCooldown(db, LATER + 6 * DAY)).toEqual(new Set([a.id, b.id]));
    expect(listTaskIdsInCooldown(db, LATER + 7 * DAY)).toEqual(new Set());
  });

  it("answers 409 conflict for a resolved suggestion and 404 for an unknown one", async () => {
    const { db, api, run } = setup();
    const task = addTask(db);
    const suggestion = insertSuggestion(db, clarificationFor(run, task.id, NOW + 1));
    resolveSuggestion(db, suggestion.id, "superseded", NOW + 2);

    const res = await api.post(`/api/suggestions/${suggestion.id}/reject`).expect(409);
    expect(errorOf(res).code).toBe("conflict");
    expect(findSuggestion(db, suggestion.id)?.status).toBe("superseded");
    expect(errorOf(await api.post("/api/suggestions/999/reject").expect(404)).code).toBe(
      "not_found",
    );
  });
});

describe("POST /api/tasks/:id/subtasks", () => {
  it("saves nothing when creating the third subtask fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { db, api } = setup();
    const parent = addTask(db);
    insertTask(db, {
      identifier: "PD-4",
      title: "Holds the third identifier",
      createdAt: NOW,
      updatedAt: NOW,
      statusChangedAt: NOW,
    });

    await api
      .post(`/api/tasks/${parent.id}/subtasks`)
      .send({ subtasks: threeSubtasks().subtasks, baseUpdatedAt: parent.updatedAt })
      .expect(500);
    expect(listSubtaskIds(db, parent.id)).toEqual([]);
    expect(getSetting(db, "identifierCounter")).toBe(1);
  });
});

describe("AI kill switch", () => {
  it("answers 403 ai_disabled on every suggestion route and keeps the tracker working", async () => {
    const { db, api, run } = setup();
    const parent = addTask(db);
    const suggestion = insertSuggestion(db, subtasksFor(run, parent.id, NOW + 1));
    await api.patch("/api/settings").send({ aiEnabled: false }).expect(200);

    const routes: [method: "get" | "post", path: string][] = [
      ["get", "/api/suggestions"],
      ["post", `/api/suggestions/${suggestion.id}/accept`],
      ["post", `/api/suggestions/${suggestion.id}/reject`],
    ];
    for (const [method, path] of routes) {
      const res = await api[method](path).send({ baseUpdatedAt: parent.updatedAt });
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(errorOf(res).code).toBe("ai_disabled");
    }
    expect(findSuggestion(db, suggestion.id)?.status).toBe("pending");

    await api.get("/api/tasks").expect(200);
    await api
      .post(`/api/tasks/${parent.id}/subtasks`)
      .send({ subtasks: [{ title: "By hand" }], baseUpdatedAt: parent.updatedAt })
      .expect(201);

    await api.patch("/api/settings").send({ aiEnabled: true }).expect(200);
    const res = await api.get("/api/suggestions").expect(200);
    expect(listSuggestionsResponseSchema.parse(res.body).items).toEqual([suggestion]);
  });
});
