import {
  AGENT_LIMITS,
  apiErrorBodySchema,
  listNotificationsResponseSchema,
  rollbackResponseSchema,
  type TaskDetail,
} from "@postdog/shared";
import type { Response } from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { tryClaim } from "../src/repositories/claims";
import { findChangeset, insertChangeset } from "../src/repositories/changesets";
import { findLink, insertLink } from "../src/repositories/links";
import { listNotes } from "../src/repositories/notes";
import { insertNotification } from "../src/repositories/notifications";
import {
  findSuggestion,
  insertSuggestion,
  listTaskIdsInCooldown,
} from "../src/repositories/suggestions";
import { findTask, insertTask, listSubtaskIds } from "../src/repositories/tasks";
import { rollbackMessage } from "../src/services/changesets";
import { jsonClient, setNow } from "./helpers";
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
const LATER = NOW + 60_000;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/**
 * An auto run that split A into a1..a3 and B into b1, b2, and linked C to D (the link op
 * belongs to C, the lowest id of the group). Each outcome has its applied suggestion.
 */
function setup() {
  setNow(NOW);
  const db = createTestDb();
  const api = jsonClient(createApp(db));
  const run = addRun(db);
  const subtasksOf = (parent: TaskDetail, titles: string[]) =>
    titles.map((title) => addTask(db, { title, parentId: parent.id }));

  const A = addTask(db, { title: "Add SSO" });
  const B = addTask(db, { title: "Add audit log" });
  const C = addTask(db, { title: "Login page" });
  const D = addTask(db, { title: "Login API" });
  const [a1, a2, a3] = subtasksOf(A, ["Pick a provider", "Store sessions", "Add tests"]) as [
    TaskDetail,
    TaskDetail,
    TaskDetail,
  ];
  const [b1, b2] = subtasksOf(B, ["Define events", "Write the log"]) as [TaskDetail, TaskDetail];
  const link = insertLink(db, {
    fromTaskId: C.id,
    toTaskId: D.id,
    type: "relates",
    createdBy: `agent:${run}`,
    createdAt: NOW,
  });

  const changeset = insertChangeset(db, {
    runId: run,
    ops: [
      ...[a1, a2, a3].map((sub) => ({ type: "create_task" as const, id: sub.id, taskId: A.id })),
      ...[b1, b2].map((sub) => ({ type: "create_task" as const, id: sub.id, taskId: B.id })),
      { type: "create_link", id: link.id, taskId: C.id },
    ],
    now: NOW,
  });
  const suggestions = {
    A: insertSuggestion(db, { ...subtasksFor(run, A.id, NOW), status: "applied" }),
    B: insertSuggestion(db, { ...subtasksFor(run, B.id, NOW), status: "applied" }),
    C: insertSuggestion(db, { ...relatedOf(run, [C.id, D.id], NOW), status: "applied" }),
  };
  setNow(LATER);

  const rollback = (body?: { taskId?: number }, expected = 200) => {
    const req = api.post(`/api/changesets/${changeset.id}/rollback`);
    return (body ? req.send(body) : req).expect(expected);
  };
  return {
    db,
    api,
    run,
    tasks: { A, B, C, D, a1, a2, a3, b1, b2 },
    link,
    changeset,
    suggestions,
    rollback,
  };
}

const rolledBack = (res: Response) => rollbackResponseSchema.parse(res.body);
const errorOf = (res: Response) => apiErrorBodySchema.parse(res.body).error;

describe("POST /api/changesets/:id/rollback", () => {
  it("deletes untouched subtasks and keeps edited ones", async () => {
    const { db, api, tasks, link, changeset, rollback } = setup();
    const { A, B, C, D, a2 } = tasks;
    await api.patch(`/api/tasks/${a2.id}`).send({ title: "Store sessions in Redis" }).expect(200);

    const body = rolledBack(await rollback());

    expect(body.deleted).toEqual({ tasks: 4, links: 1 });
    expect(body.kept).toEqual([
      {
        type: "create_task",
        id: a2.id,
        taskId: A.id,
        identifier: a2.identifier,
        title: "Store sessions in Redis",
        reason: "edited",
      },
    ]);
    expect(body.message).toBe("Removed 4 subtasks and 1 link. 1 subtask was edited and kept.");
    expect(listSubtaskIds(db, A.id)).toEqual([a2.id]);
    expect(listSubtaskIds(db, B.id)).toEqual([]);
    expect(findLink(db, C.id, D.id, "relates")).toBeUndefined();

    expect(body.changeset.status).toBe("partially_rolled_back");
    expect(body.changeset.tasks.map((t) => [t.taskId, t.state])).toEqual([
      [A.id, "partially_rolled_back"],
      [B.id, "rolled_back"],
      [C.id, "rolled_back"],
    ]);
    expect(findChangeset(db, changeset.id)?.ops.map((op) => [op.id, op.state])).toEqual([
      [tasks.a1.id, "rolled_back"],
      [a2.id, "kept"],
      [tasks.a3.id, "rolled_back"],
      [tasks.b1.id, "rolled_back"],
      [tasks.b2.id, "rolled_back"],
      [link.id, "rolled_back"],
    ]);
  });

  it("keeps a started, a finished, an edited subtask and ones with children or notes", async () => {
    const { db, api, tasks, rollback, suggestions } = setup();
    const { C, D, a1, a2, a3, b1, b2 } = tasks;
    await api.patch(`/api/tasks/${a1.id}`).send({ status: "in_progress" }).expect(200);
    const child = insertTask(db, {
      identifier: "PD-99",
      title: "Nested by hand",
      parentId: a2.id,
      createdAt: LATER,
      updatedAt: LATER,
      statusChangedAt: LATER,
    });
    await api.post(`/api/tasks/${a3.id}/notes`).send({ body: "Half done" }).expect(201);
    await api.patch(`/api/tasks/${b1.id}`).send({ status: "done" }).expect(200);
    await api.patch(`/api/tasks/${b2.id}`).send({ description: "Use JSON lines" }).expect(200);

    const body = rolledBack(await rollback({}));

    expect(body.deleted).toEqual({ tasks: 0, links: 1 });
    expect(body.kept.map((item) => [item.id, item.reason])).toEqual([
      [a1.id, "status_changed"],
      [a2.id, "has_children"],
      [a3.id, "has_notes"],
      [b1.id, "status_changed"],
      [b2.id, "edited"],
    ]);
    expect(body.message).toBe(
      "Removed 1 link. 1 subtask was edited and kept. 1 subtask had its own subtasks and was kept. " +
        "1 subtask had notes and was kept. 2 subtasks were started or finished and kept.",
    );
    expect(findTask(db, child.id)).toBeDefined();
    expect(listNotes(db, a3.id)).toHaveLength(1);
    expect(body.changeset.tasks.map((t) => t.state)).toEqual(["kept", "kept", "rolled_back"]);
    expect(body.changeset.status).toBe("partially_rolled_back");

    // A task whose ops were all kept stays applied and out of the cooldown.
    expect(findSuggestion(db, suggestions.A.id)?.status).toBe("applied");
    expect(findSuggestion(db, suggestions.B.id)?.status).toBe("applied");
    expect(findSuggestion(db, suggestions.C.id)?.status).toBe("rolled_back");
    expect(listTaskIdsInCooldown(db, LATER)).toEqual(new Set([C.id, D.id]));
  });

  it("keeps a subtask linked by someone other than the run, in either direction", async () => {
    const { db, api, run, tasks, rollback } = setup();
    const { A, B, D, a1, a2, a3, b1 } = tasks;
    await api
      .post(`/api/tasks/${a1.id}/links`)
      .send({ toTaskId: D.id, type: "blocks" })
      .expect(201);
    insertLink(db, {
      fromTaskId: D.id,
      toTaskId: a2.id,
      type: "relates",
      createdBy: `agent:${run + 1}`,
      createdAt: LATER,
    });
    insertLink(db, {
      fromTaskId: b1.id,
      toTaskId: a3.id,
      type: "relates",
      createdBy: `agent:${run}`,
      createdAt: NOW,
    });

    const body = rolledBack(await rollback());

    expect(body.kept.map((item) => [item.id, item.reason])).toEqual([
      [a1.id, "has_links"],
      [a2.id, "has_links"],
    ]);
    expect(body.message).toBe("Removed 3 subtasks and 1 link. 2 subtasks had links and were kept.");
    expect(listSubtaskIds(db, A.id)).toEqual([a1.id, a2.id]);
    expect(listSubtaskIds(db, B.id)).toEqual([]);
    expect(findLink(db, a1.id, D.id, "blocks")).toBeDefined();
    expect(findLink(db, D.id, a2.id, "relates")).toBeDefined();
  });

  it("rolls back one task's part and leaves the other tasks' ops applied", async () => {
    const { db, api, tasks, link, changeset, rollback, suggestions } = setup();
    const { A, B, C } = tasks;
    insertNotification(db, {
      kind: "auto_decomposition",
      title: "Split 2 tasks into 5 subtasks",
      changesetId: changeset.id,
      createdAt: NOW,
    });

    const body = rolledBack(await rollback({ taskId: A.id }));

    expect(body.deleted).toEqual({ tasks: 3, links: 0 });
    expect(body.message).toBe("Removed 3 subtasks.");
    expect(listSubtaskIds(db, A.id)).toEqual([]);
    expect(listSubtaskIds(db, B.id)).toEqual([tasks.b1.id, tasks.b2.id]);
    expect(findLink(db, C.id, tasks.D.id, "relates")).toEqual(link);
    expect(body.changeset.status).toBe("partially_rolled_back");
    expect(body.changeset.tasks.map((t) => [t.taskId, t.state])).toEqual([
      [A.id, "rolled_back"],
      [B.id, "applied"],
      [C.id, "applied"],
    ]);
    expect(findSuggestion(db, suggestions.A.id)?.status).toBe("rolled_back");
    expect(findSuggestion(db, suggestions.B.id)?.status).toBe("applied");
    expect(listTaskIdsInCooldown(db, LATER)).toEqual(new Set([A.id]));

    // The Inbox reads the same changeset as it is now.
    const inbox = listNotificationsResponseSchema.parse(
      (await api.get("/api/notifications").expect(200)).body,
    );
    expect(inbox.items[0]?.changeset).toEqual(body.changeset);

    // The link op belongs to C, the lowest id of the related group.
    const linkPart = rolledBack(await rollback({ taskId: C.id }));
    expect(linkPart.deleted).toEqual({ tasks: 0, links: 1 });
    expect(linkPart.message).toBe("Removed 1 link.");
    expect(linkPart.changeset.status).toBe("partially_rolled_back");

    const last = rolledBack(await rollback({ taskId: B.id }));
    expect(last.message).toBe("Removed 2 subtasks.");
    expect(last.changeset.status).toBe("rolled_back");
  });

  it("counts a subtask or link the user already deleted as rolled back, not kept", async () => {
    const { db, api, tasks, link, changeset, rollback } = setup();
    const { A, C, D, a1 } = tasks;
    await api.delete(`/api/tasks/${a1.id}`).expect(204);
    await api.delete(`/api/links/${link.id}`).expect(204);

    const body = rolledBack(await rollback());

    expect(body.deleted).toEqual({ tasks: 4, links: 0 });
    expect(body.kept).toEqual([]);
    expect(body.message).toBe("Removed 4 subtasks.");
    expect(body.changeset.status).toBe("rolled_back");
    expect(findChangeset(db, changeset.id)?.ops.every((op) => op.state === "rolled_back")).toBe(
      true,
    );
    expect(listTaskIdsInCooldown(db, LATER)).toEqual(new Set([A.id, tasks.B.id, C.id, D.id]));
  });

  it("keeps the parent's updatedAt and recomputes aiState", async () => {
    const { db, run, tasks, rollback } = setup();
    const { A, B } = tasks;
    // A claim that expired leaves processing on the task until the next write.
    tryClaim(db, A.id, run, "decomposer", LATER - AGENT_LIMITS.claimTtlMs - 1);
    insertSuggestion(db, clarificationFor(addRun(db), B.id, LATER));
    expect(aiStateOf(db, A.id)).toBe("processing");

    await rollback();

    expect(findTask(db, A.id)?.updatedAt).toBe(A.updatedAt);
    expect(findTask(db, B.id)?.updatedAt).toBe(B.updatedAt);
    expect(aiStateOf(db, A.id)).toBe("none");
    expect(aiStateOf(db, B.id)).toBe("clarification_pending");
  });

  it("answers a second rollback with nothing left to roll back", async () => {
    const { db, api, tasks, changeset, rollback, suggestions } = setup();
    await api.patch(`/api/tasks/${tasks.a2.id}`).send({ title: "Edited" }).expect(200);
    const first = rolledBack(await rollback());
    const resolvedAt = findSuggestion(db, suggestions.A.id)?.resolvedAt;

    setNow(LATER + 1000);
    const again = rolledBack(await rollback());
    expect(again).toEqual({
      changeset: first.changeset,
      deleted: { tasks: 0, links: 0 },
      kept: [],
      message: "Nothing left to roll back.",
    });
    expect(rolledBack(await rollback({ taskId: tasks.B.id })).message).toBe(
      "Nothing left to roll back.",
    );
    expect(findTask(db, tasks.a2.id)).toBeDefined();
    expect(findChangeset(db, changeset.id)?.status).toBe("partially_rolled_back");
    expect(findSuggestion(db, suggestions.A.id)?.resolvedAt).toBe(resolvedAt);
  });

  it("answers 404 for a missing changeset or a task the changeset did not change", async () => {
    const { api, tasks, rollback } = setup();
    const missing = await api.post("/api/changesets/999/rollback").send({}).expect(404);
    expect(errorOf(missing).code).toBe("not_found");

    const res = await rollback({ taskId: tasks.D.id }, 404);
    expect(errorOf(res)).toMatchObject({
      code: "not_found",
      message: expect.stringContaining(`task ${tasks.D.id}`),
    });
  });

  it("rejects a taskId that is not an id with 400", async () => {
    const { api, changeset } = setup();
    const res = await api
      .post(`/api/changesets/${changeset.id}/rollback`)
      .send({ taskId: "PD-1" })
      .expect(400);
    expect(errorOf(res).code).toBe("validation_error");
  });

  it("saves nothing when a delete fails midway", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { db, tasks, link, changeset, rollback, suggestions } = setup();
    db.$client.exec(
      `create trigger fail_delete before delete on tasks when old.id = ${tasks.b1.id}
       begin select raise(abort, 'injected failure'); end`,
    );

    const res = await rollback(undefined, 500);

    expect(errorOf(res).code).toBe("internal_error");
    expect(listSubtaskIds(db, tasks.A.id)).toEqual([tasks.a1.id, tasks.a2.id, tasks.a3.id]);
    expect(findLink(db, tasks.C.id, tasks.D.id, "relates")).toEqual(link);
    expect(findChangeset(db, changeset.id)).toEqual(changeset);
    expect(findSuggestion(db, suggestions.A.id)?.status).toBe("applied");
    expect(listTaskIdsInCooldown(db, LATER).size).toBe(0);
  });

  it("works with AI turned off, as do the notifications", async () => {
    const { db, api, changeset, tasks, rollback } = setup();
    const notification = insertNotification(db, {
      kind: "auto_decomposition",
      title: "Split 2 tasks into 5 subtasks",
      changesetId: changeset.id,
      createdAt: NOW,
    });
    await api.patch("/api/settings").send({ aiEnabled: false }).expect(200);
    await api.get("/api/suggestions").expect(403);

    const inbox = await api.get("/api/notifications").expect(200);
    expect(listNotificationsResponseSchema.parse(inbox.body).unreadCount).toBe(1);
    await api.post(`/api/notifications/${notification.id}/read`).expect(200);
    expect(rolledBack(await rollback()).deleted).toEqual({ tasks: 5, links: 1 });
    expect(listSubtaskIds(db, tasks.A.id)).toEqual([]);
  });
});

describe("rollbackMessage", () => {
  const kept = (...reasons: ("edited" | "has_children" | "has_notes" | "status_changed")[]) =>
    reasons.map((reason) => ({ reason }));

  it("names what was removed, leaving out zero counts", () => {
    expect(rollbackMessage({ tasks: 5, links: 1 }, kept("edited", "edited"))).toBe(
      "Removed 5 subtasks and 1 link. 2 subtasks were edited and kept.",
    );
    expect(rollbackMessage({ tasks: 1, links: 0 }, [])).toBe("Removed 1 subtask.");
    expect(rollbackMessage({ tasks: 0, links: 2 }, [])).toBe("Removed 2 links.");
  });

  it("says why each kept subtask stayed, singular and plural", () => {
    expect(rollbackMessage({ tasks: 0, links: 0 }, kept("has_children"))).toBe(
      "1 subtask had its own subtasks and was kept.",
    );
    expect(
      rollbackMessage(
        { tasks: 3, links: 0 },
        kept(
          "status_changed",
          "has_children",
          "edited",
          "has_notes",
          "has_children",
          "status_changed",
        ),
      ),
    ).toBe(
      "Removed 3 subtasks. 1 subtask was edited and kept. 2 subtasks had their own subtasks and were kept. " +
        "1 subtask had notes and was kept. 2 subtasks were started or finished and kept.",
    );
    expect(rollbackMessage({ tasks: 0, links: 0 }, kept("has_notes", "has_notes"))).toBe(
      "2 subtasks had notes and were kept.",
    );
  });

  it("says there is nothing left when nothing was removed or kept", () => {
    expect(rollbackMessage({ tasks: 0, links: 0 }, [])).toBe("Nothing left to roll back.");
  });
});
