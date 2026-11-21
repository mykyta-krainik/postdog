import type { TaskStatus } from "@postdog/shared";
import { describe, expect, it } from "vitest";
import { groupTasksByStatus } from "./status";

const task = (id: number, status: TaskStatus) => ({ id, status });

describe("groupTasksByStatus", () => {
  it("puts active work first and finished work last", () => {
    const groups = groupTasksByStatus([task(1, "done"), task(2, "todo"), task(3, "in_progress")]);
    expect(groups.map((group) => group.status)).toEqual(["in_progress", "todo", "done"]);
  });

  it("keeps the API's sort order inside each group", () => {
    const groups = groupTasksByStatus([
      task(5, "todo"),
      task(9, "done"),
      task(2, "todo"),
      task(7, "todo"),
    ]);
    expect(groups.find((group) => group.status === "todo")?.tasks.map((t) => t.id)).toEqual([
      5, 2, 7,
    ]);
  });

  it("leaves out statuses with no tasks", () => {
    expect(groupTasksByStatus([task(1, "todo")]).map((group) => group.status)).toEqual(["todo"]);
    expect(groupTasksByStatus([])).toEqual([]);
  });
});
