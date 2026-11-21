import { apiErrorBodySchema, taskLinkSchema, type TaskDetail } from "@postdog/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTask, createTestApi, getTask, setNow, type Api } from "./helpers";

let api: Api;
let a: TaskDetail;
let b: TaskDetail;
beforeEach(async () => {
  api = createTestApi();
  a = await createTask(api, { title: "A" });
  b = await createTask(api, { title: "B" });
});
afterEach(() => {
  vi.useRealTimers();
});

const link = (from: number, toTaskId: number, type: string) =>
  api.post(`/api/tasks/${from}/links`).send({ toTaskId, type });

const errorCode = (body: unknown) => apiErrorBodySchema.parse(body).error.code;

describe("task links", () => {
  it("creates a link by the user with 201", async () => {
    setNow(7_000);
    const res = await link(a.id, b.id, "blocks").expect(201);
    expect(taskLinkSchema.parse(res.body)).toEqual({
      id: 1,
      fromTaskId: a.id,
      toTaskId: b.id,
      type: "blocks",
      createdBy: "user",
      createdAt: 7_000,
    });
  });

  it("shows the link on both tasks with its direction", async () => {
    await link(a.id, b.id, "blocks").expect(201);
    expect((await getTask(api, a.id)).links).toEqual([
      {
        id: 1,
        type: "blocks",
        direction: "out",
        task: { id: b.id, identifier: b.identifier, title: "B", status: "todo" },
      },
    ]);
    expect((await getTask(api, b.id)).links).toEqual([
      {
        id: 1,
        type: "blocks",
        direction: "in",
        task: { id: a.id, identifier: a.identifier, title: "A", status: "todo" },
      },
    ]);
  });

  it("returns 409 conflict for a duplicate link", async () => {
    await link(a.id, b.id, "blocks").expect(201);
    expect(errorCode((await link(a.id, b.id, "blocks").expect(409)).body)).toBe("conflict");
  });

  it("returns 409 conflict for the reverse of an existing relates link", async () => {
    await link(a.id, b.id, "relates").expect(201);
    expect(errorCode((await link(b.id, a.id, "relates").expect(409)).body)).toBe("conflict");
  });

  it("allows another type between the same tasks, and the reverse of a directed link", async () => {
    await link(a.id, b.id, "blocks").expect(201);
    await link(a.id, b.id, "duplicates").expect(201);
    await link(b.id, a.id, "blocks").expect(201);
  });

  it("rejects a self-link and an unknown target with 400 on toTaskId", async () => {
    for (const toTaskId of [a.id, 999]) {
      const res = await link(a.id, toTaskId, "relates").expect(400);
      const { error } = apiErrorBodySchema.parse(res.body);
      expect(error.code).toBe("validation_error");
      expect(error.details).toMatchObject({ issues: [{ path: "toTaskId" }] });
    }
  });

  it("404s a link from an unknown task", async () => {
    await link(999, a.id, "relates").expect(404);
  });

  it("deletes a link with 204, then 404s it", async () => {
    const created = taskLinkSchema.parse((await link(a.id, b.id, "relates").expect(201)).body);
    const res = await api.delete(`/api/links/${created.id}`).expect(204);
    expect(res.text).toBe("");
    expect((await getTask(api, a.id)).links).toEqual([]);
    expect(errorCode((await api.delete(`/api/links/${created.id}`).expect(404)).body)).toBe(
      "not_found",
    );
  });
});
