import type { TaskDetail, TaskListItem } from "@postdog/shared";
import { describe, expect, it } from "vitest";
import { isOptimisticPatch, patchTaskCache } from "./optimistic";

function listItem(id: number, overrides: Partial<TaskListItem> = {}): TaskListItem {
  return {
    id,
    identifier: `PD-${id}`,
    title: `Task ${id}`,
    status: "todo",
    priority: "medium",
    parentId: null,
    aiState: "none",
    createdAt: 1_000,
    updatedAt: 1_000,
    statusChangedAt: 1_000,
    subtaskCount: 0,
    subtaskDoneCount: 0,
    linkCount: 0,
    ...overrides,
  };
}

function detail(id: number, subtasks: TaskListItem[] = []): TaskDetail {
  return {
    id,
    identifier: `PD-${id}`,
    title: `Task ${id}`,
    description: "",
    status: "todo",
    priority: "medium",
    parentId: null,
    aiState: "none",
    createdAt: 1_000,
    updatedAt: 1_000,
    statusChangedAt: 1_000,
    subtasks,
    links: [],
    pendingSuggestions: [],
  };
}

describe("isOptimisticPatch", () => {
  it("accepts status and priority changes only", () => {
    expect(isOptimisticPatch({ status: "done" })).toBe(true);
    expect(isOptimisticPatch({ status: "done", priority: "high" })).toBe(true);
    expect(isOptimisticPatch({ status: "done", title: "Renamed" })).toBe(false);
    expect(isOptimisticPatch({ description: "More" })).toBe(false);
    expect(isOptimisticPatch({})).toBe(false);
  });
});

describe("patchTaskCache", () => {
  it("changes the matching task in a list and leaves the others alone", () => {
    const list = { items: [listItem(1), listItem(2)] };
    expect(patchTaskCache(list, 2, { status: "in_progress" })).toEqual({
      items: [listItem(1), listItem(2, { status: "in_progress" })],
    });
  });

  it("changes a task detail", () => {
    expect(patchTaskCache(detail(3), 3, { priority: "high" })).toMatchObject({
      id: 3,
      priority: "high",
    });
  });

  it("changes a subtask inside its parent's detail", () => {
    const parent = detail(3, [listItem(4), listItem(5)]);
    const patched = patchTaskCache(parent, 5, { status: "done" }) as TaskDetail;
    expect(patched.status).toBe("todo");
    expect(patched.subtasks.map((s) => s.status)).toEqual(["todo", "done"]);
  });

  it("ignores fields the patch leaves undefined", () => {
    const list = { items: [listItem(1, { priority: "low" })] };
    expect(patchTaskCache(list, 1, { status: "done", priority: undefined })).toEqual({
      items: [listItem(1, { status: "done", priority: "low" })],
    });
  });

  it("does not change the input or an empty cache entry", () => {
    const list = { items: [listItem(1)] };
    patchTaskCache(list, 1, { status: "done" });
    expect(list.items[0]?.status).toBe("todo");
    expect(patchTaskCache(undefined, 1, { status: "done" })).toBeUndefined();
  });
});
