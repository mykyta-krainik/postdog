import { describe, expect, it } from "vitest";
import { taskKeys } from "./keys";

describe("taskKeys", () => {
  it("gives one list key whether defaults are spelled out or not", () => {
    expect(taskKeys.list()).toBe(taskKeys.list({ sort: "createdAt", order: "desc" }));
    expect(taskKeys.list({ q: "  " })).toBe(taskKeys.list());
  });

  it("gives different list keys for different queries", () => {
    expect(taskKeys.list({ status: "todo" })).not.toBe(taskKeys.list({ status: "done" }));
    expect(taskKeys.list({ parentId: 4 })).not.toBe(taskKeys.list());
  });

  it("requests the list endpoint with the query", () => {
    const url = new URL(taskKeys.list({ status: "todo", q: "auth" }), "http://localhost");
    expect(url.pathname).toBe("/api/tasks");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      status: "todo",
      q: "auth",
      sort: "createdAt",
      order: "desc",
    });
  });

  it("requests the notes endpoint of one task", () => {
    expect(taskKeys.notes(12)).toBe("/api/tasks/12/notes");
    expect(taskKeys.notes(12)).not.toBe(taskKeys.notes(13));
  });

  it("tells task rows apart from other resources", () => {
    expect(taskKeys.holdsTasks(taskKeys.notes(12))).toBe(false);
    expect(taskKeys.holdsTasks(taskKeys.list({ status: "todo" }))).toBe(true);
    expect(taskKeys.holdsTasks(taskKeys.detail(12))).toBe(true);
    expect(taskKeys.holdsTasks("/api/tasks/12/notes")).toBe(false);
    expect(taskKeys.holdsTasks("/api/settings")).toBe(false);
  });
});
