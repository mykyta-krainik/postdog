import { apiErrorBodySchema, taskDetailSchema } from "@postdog/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTask, createTestApi, getTask, listTasks, setNow, type Api } from "./helpers";

let api: Api;
beforeEach(() => {
  api = createTestApi();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("task CRUD", () => {
  it("creates a task with defaults, an identifier and equal timestamps", async () => {
    setNow(1_000);
    const res = await api.post("/api/tasks").send({ title: "  Fix login  " }).expect(201);
    expect(taskDetailSchema.parse(res.body)).toEqual({
      id: 1,
      identifier: "PD-1",
      title: "Fix login",
      description: "",
      status: "todo",
      priority: "medium",
      parentId: null,
      aiState: "none",
      createdAt: 1_000,
      updatedAt: 1_000,
      statusChangedAt: 1_000,
      subtasks: [],
      links: [],
      pendingSuggestions: [],
    });
  });

  it("numbers identifiers from a counter that never reuses a deleted one", async () => {
    const first = await createTask(api);
    await api.delete(`/api/tasks/${first.id}`).expect(204);
    const second = await createTask(api);
    const third = await createTask(api);
    expect([first.identifier, second.identifier, third.identifier]).toEqual([
      "PD-1",
      "PD-2",
      "PD-3",
    ]);
  });

  it("reads a task back by id and 404s an unknown one", async () => {
    const task = await createTask(api, { title: "Read me", description: "Body" });
    expect(await getTask(api, task.id)).toEqual(task);

    const res = await api.get("/api/tasks/999").expect(404);
    expect(apiErrorBodySchema.parse(res.body).error.code).toBe("not_found");
  });

  it("updates only the sent fields", async () => {
    const task = await createTask(api, { title: "Old", priority: "low", description: "Keep" });
    const res = await api.patch(`/api/tasks/${task.id}`).send({ title: "New" }).expect(200);
    const updated = taskDetailSchema.parse(res.body);
    expect(updated).toMatchObject({
      title: "New",
      priority: "low",
      description: "Keep",
      status: "todo",
    });
  });

  it("404s a patch or delete of an unknown task", async () => {
    await api.patch("/api/tasks/999").send({ title: "x" }).expect(404);
    await api.delete("/api/tasks/999").expect(404);
  });

  it("deletes a task with 204 and no body", async () => {
    const task = await createTask(api);
    const res = await api.delete(`/api/tasks/${task.id}`).expect(204);
    expect(res.text).toBe("");
    await api.get(`/api/tasks/${task.id}`).expect(404);
  });
});

describe("task list", () => {
  it("lists top-level tasks newest first by default, wrapped in items", async () => {
    setNow(1_000);
    const older = await createTask(api, { title: "Older" });
    setNow(2_000);
    const newer = await createTask(api, { title: "Newer" });
    await createTask(api, { title: "Child", parentId: older.id });

    const res = await api.get("/api/tasks").expect(200);
    expect(Object.keys(res.body)).toEqual(["items"]);
    expect((await listTasks(api)).map((t) => t.id)).toEqual([newer.id, older.id]);
    expect((await listTasks(api, "?order=asc")).map((t) => t.id)).toEqual([older.id, newer.id]);
  });

  it("filters by status", async () => {
    await createTask(api, { title: "A", status: "todo" });
    const doing = await createTask(api, { title: "B", status: "in_progress" });
    await createTask(api, { title: "C", status: "done" });
    expect((await listTasks(api, "?status=in_progress")).map((t) => t.id)).toEqual([doing.id]);
  });

  it("sorts by priority rank, not alphabetically", async () => {
    setNow(1_000);
    const medium = await createTask(api, { title: "M", priority: "medium" });
    setNow(2_000);
    const high = await createTask(api, { title: "H", priority: "high" });
    setNow(3_000);
    const low = await createTask(api, { title: "L", priority: "low" });
    setNow(4_000);
    const high2 = await createTask(api, { title: "H2", priority: "high" });

    expect((await listTasks(api, "?sort=priority")).map((t) => t.id)).toEqual([
      high2.id,
      high.id,
      medium.id,
      low.id,
    ]);
    expect((await listTasks(api, "?sort=priority&order=asc")).map((t) => t.id)).toEqual([
      low.id,
      medium.id,
      high2.id,
      high.id,
    ]);
  });

  it("lists the subtasks of a parent with parentId", async () => {
    const parent = await createTask(api, { title: "Parent" });
    const child = await createTask(api, { title: "Child", parentId: parent.id });
    expect((await listTasks(api, `?parentId=${parent.id}`)).map((t) => t.id)).toEqual([child.id]);
  });

  it("searches title and description case-insensitively, and ignores a blank q", async () => {
    const byTitle = await createTask(api, { title: "Fix LOGIN redirect" });
    const byDescription = await createTask(api, { title: "Auth", description: "The login page" });
    await createTask(api, { title: "Unrelated" });

    const found = await listTasks(api, "?q=Login");
    expect(found.map((t) => t.id).sort()).toEqual([byTitle.id, byDescription.id].sort());
    expect(await listTasks(api, "?q=%20%20")).toHaveLength(3);
    expect(await listTasks(api, "?q=100%25")).toHaveLength(0);
  });

  it("carries subtask, done and link counts and omits the description", async () => {
    const parent = await createTask(api, { title: "Parent", description: "Long text" });
    const other = await createTask(api, { title: "Other" });
    const doneChild = await createTask(api, { title: "Done", parentId: parent.id });
    await api.patch(`/api/tasks/${doneChild.id}`).send({ status: "done" }).expect(200);
    await createTask(api, { title: "Open", parentId: parent.id });
    await api.post(`/api/tasks/${other.id}/links`).send({ toTaskId: parent.id, type: "blocks" });

    await createTask(api, { title: "Loner" });

    const items = await listTasks(api, "?order=asc");
    expect(
      items.map(({ subtaskCount, subtaskDoneCount, linkCount, aiState }) => ({
        subtaskCount,
        subtaskDoneCount,
        linkCount,
        aiState,
      })),
    ).toEqual([
      { subtaskCount: 2, subtaskDoneCount: 1, linkCount: 1, aiState: "none" },
      { subtaskCount: 0, subtaskDoneCount: 0, linkCount: 1, aiState: "none" },
      { subtaskCount: 0, subtaskDoneCount: 0, linkCount: 0, aiState: "none" },
    ]);
    expect(items[0]).not.toHaveProperty("description");
  });
});

describe("timestamps", () => {
  it("moves statusChangedAt only when the status changes", async () => {
    setNow(1_000);
    const task = await createTask(api);
    setNow(2_000);
    await api.patch(`/api/tasks/${task.id}`).send({ title: "Renamed", priority: "high" });
    setNow(3_000);
    await api.patch(`/api/tasks/${task.id}`).send({ status: "todo" });
    expect((await getTask(api, task.id)).statusChangedAt).toBe(1_000);

    setNow(4_000);
    await api.patch(`/api/tasks/${task.id}`).send({ status: "in_progress" });
    expect((await getTask(api, task.id)).statusChangedAt).toBe(4_000);
  });

  it("bumps updatedAt for each user field that really changes", async () => {
    setNow(1_000);
    const task = await createTask(api, { title: "T", description: "D" });
    const patches = [
      { title: "T2" },
      { description: "D2" },
      { priority: "high" },
      { status: "done" },
    ] as const;
    let now = 1_000;
    for (const patch of patches) {
      now += 1_000;
      setNow(now);
      const res = await api.patch(`/api/tasks/${task.id}`).send(patch).expect(200);
      expect(res.body.updatedAt).toBe(now);
    }
  });

  it("keeps updatedAt for an empty patch or one that repeats current values", async () => {
    setNow(1_000);
    const task = await createTask(api, { title: "Same", priority: "low" });
    setNow(2_000);
    await api.patch(`/api/tasks/${task.id}`).send({}).expect(200);
    const res = await api
      .patch(`/api/tasks/${task.id}`)
      .send({ title: "Same", priority: "low", status: "todo", description: "" })
      .expect(200);
    expect(res.body.updatedAt).toBe(1_000);
  });

  it("keeps the parent's updatedAt when notes, links or subtasks are added", async () => {
    setNow(1_000);
    const parent = await createTask(api, { title: "Parent" });
    const other = await createTask(api, { title: "Other" });
    setNow(2_000);
    await api.post(`/api/tasks/${parent.id}/notes`).send({ body: "Progress" }).expect(201);
    await api
      .post(`/api/tasks/${parent.id}/links`)
      .send({ toTaskId: other.id, type: "relates" })
      .expect(201);
    await createTask(api, { title: "Child", parentId: parent.id });
    await api
      .post(`/api/tasks/${parent.id}/subtasks`)
      .send({ subtasks: [{ title: "Bulk" }], baseUpdatedAt: 1_000 })
      .expect(201);

    expect((await getTask(api, parent.id)).updatedAt).toBe(1_000);
    expect((await getTask(api, other.id)).updatedAt).toBe(1_000);
  });
});

describe("subtasks", () => {
  it("creates a subtask with parentId and shows it on the parent", async () => {
    const parent = await createTask(api, { title: "Parent" });
    const child = await createTask(api, { title: "Child", parentId: parent.id });
    expect(child.parentId).toBe(parent.id);
    expect((await getTask(api, parent.id)).subtasks.map((s) => s.id)).toEqual([child.id]);
  });

  it("rejects a subtask of a subtask and an unknown parent with 400", async () => {
    const parent = await createTask(api, { title: "Parent" });
    const child = await createTask(api, { title: "Child", parentId: parent.id });

    for (const parentId of [child.id, 999]) {
      const res = await api.post("/api/tasks").send({ title: "Deep", parentId }).expect(400);
      const { error } = apiErrorBodySchema.parse(res.body);
      expect(error.code).toBe("validation_error");
      expect(error.details).toMatchObject({ issues: [{ path: "parentId" }] });
    }
    const bulk = await api
      .post(`/api/tasks/${child.id}/subtasks`)
      .send({ subtasks: [{ title: "Deep" }], baseUpdatedAt: child.updatedAt })
      .expect(400);
    expect(bulk.body.error.code).toBe("validation_error");
  });

  it("bulk-creates subtasks in order and returns the parent's detail", async () => {
    setNow(5_000);
    const parent = await createTask(api, { title: "Parent", status: "in_progress" });
    const res = await api
      .post(`/api/tasks/${parent.id}/subtasks`)
      .send({
        subtasks: [
          { title: "Design", priority: "high" },
          { title: "Build", description: "With tests" },
        ],
        baseUpdatedAt: 5_000,
      })
      .expect(201);
    const detail = taskDetailSchema.parse(res.body);
    expect(detail.id).toBe(parent.id);
    expect(detail.subtasks).toMatchObject([
      { identifier: "PD-2", title: "Design", priority: "high", status: "todo", parentId: 1 },
      { identifier: "PD-3", title: "Build", priority: "medium", status: "todo", parentId: 1 },
    ]);
  });

  it("returns 409 stale and creates nothing when baseUpdatedAt is out of date", async () => {
    setNow(1_000);
    const parent = await createTask(api, { title: "Parent" });
    setNow(2_000);
    await api.patch(`/api/tasks/${parent.id}`).send({ title: "Edited" }).expect(200);

    const res = await api
      .post(`/api/tasks/${parent.id}/subtasks`)
      .send({ subtasks: [{ title: "A" }, { title: "B" }], baseUpdatedAt: 1_000 })
      .expect(409);
    expect(apiErrorBodySchema.parse(res.body).error.code).toBe("stale");
    expect((await getTask(api, parent.id)).subtasks).toEqual([]);
    expect((await createTask(api)).identifier).toBe("PD-2");
  });

  it("404s a bulk create on an unknown parent", async () => {
    await api
      .post("/api/tasks/999/subtasks")
      .send({ subtasks: [{ title: "A" }], baseUpdatedAt: 0 })
      .expect(404);
  });
});

describe("delete cascade", () => {
  it("removes subtasks, notes and links of a deleted task", async () => {
    const parent = await createTask(api, { title: "Parent" });
    const child = await createTask(api, { title: "Child", parentId: parent.id });
    const other = await createTask(api, { title: "Other" });
    await api.post(`/api/tasks/${parent.id}/notes`).send({ body: "Note" }).expect(201);
    await api
      .post(`/api/tasks/${other.id}/links`)
      .send({ toTaskId: parent.id, type: "blocks" })
      .expect(201);
    await api
      .post(`/api/tasks/${child.id}/links`)
      .send({ toTaskId: other.id, type: "relates" })
      .expect(201);

    await api.delete(`/api/tasks/${parent.id}`).expect(204);

    await api.get(`/api/tasks/${child.id}`).expect(404);
    await api.get(`/api/tasks/${parent.id}/notes`).expect(404);
    expect((await getTask(api, other.id)).links).toEqual([]);
    expect((await listTasks(api)).map((t) => [t.id, t.linkCount])).toEqual([[other.id, 0]]);
  });
});
