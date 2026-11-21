import { describe, expect, it } from "vitest";
import { computeTaskFacts } from "../../src/agents/context";
import { ToolError } from "../../src/agents/core/errors";
import { createReadTools } from "../../src/agents/tools/read";
import { IN_MEMORY, openDatabase, type Db } from "../../src/db/client";
import type { TaskRow } from "../../src/db/schema";
import { migrateDatabase } from "../../src/db/migrate";
import { insertNote } from "../../src/repositories/notes";
import { createLinkService } from "../../src/services/links";
import { createTaskService } from "../../src/services/tasks";

const DAY = 24 * 60 * 60 * 1000;

function setup() {
  const db: Db = openDatabase(IN_MEMORY);
  migrateDatabase(db);
  const tasks = createTaskService(db);
  const links = createLinkService(db);
  return { db, tasks, links, tools: createReadTools(db, () => Date.now() + 3 * DAY) };
}

function toolError(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(ToolError);
    return (err as ToolError).message;
  }
  throw new Error("Expected a ToolError");
}

describe("get_task", () => {
  it("returns the task with subtasks, links named by direction and day counts", () => {
    const { tasks, links, tools } = setup();
    const parent = tasks.create({ title: "Ship SSO", description: "Okta and Azure AD" });
    const sub = tasks.create({ title: "Metadata upload", parentId: parent.id, status: "done" });
    const blocker = tasks.create({ title: "Pick a library" });
    const dup = tasks.create({ title: "SSO again" });
    links.create(blocker.id, { toTaskId: parent.id, type: "blocks" });
    links.create(dup.id, { toTaskId: parent.id, type: "duplicates" });

    const result = tools.getTask.run({ id: parent.id });
    expect(result).toEqual({
      id: parent.id,
      identifier: parent.identifier,
      title: "Ship SSO",
      status: "todo",
      priority: "medium",
      parentId: null,
      aiState: "none",
      ageDays: 3,
      daysInStatus: 3,
      description: "Okta and Azure AD",
      subtasks: [
        { id: sub.id, identifier: sub.identifier, title: "Metadata upload", status: "done" },
      ],
      links: [
        {
          relation: "blocked_by",
          id: blocker.id,
          identifier: blocker.identifier,
          title: "Pick a library",
          status: "todo",
        },
        {
          relation: "duplicated_by",
          id: dup.id,
          identifier: dup.identifier,
          title: "SSO again",
          status: "todo",
        },
      ],
    });
    expect(tools.getTask.run({ id: blocker.id }).links[0]!.relation).toBe("blocks");
  });

  it("cuts a long description at 1,500 characters and says so", () => {
    const { tasks, tools } = setup();
    const task = tasks.create({ title: "Long", description: "x".repeat(4000) });
    const result = tools.getTask.run({ id: task.id });
    expect(result.description).toHaveLength(1500);
    expect(result.truncated).toBe(true);
    expect(tools.getTask.run({ id: tasks.create({ title: "Short" }).id })).not.toHaveProperty(
      "truncated",
    );
  });

  it("tells the model how to recover from an unknown id", () => {
    const { tools } = setup();
    expect(toolError(() => tools.getTask.run({ id: 42 }))).toBe(
      "Task 42 not found. Use search_tasks to find valid IDs.",
    );
  });
});

describe("search_tasks", () => {
  it("matches every word in titles or descriptions across task levels", () => {
    const { tasks, tools } = setup();
    const top = tasks.create({ title: "Rate limit the public API" });
    const sub = tasks.create({
      title: "Return 429",
      description: "rate per key",
      parentId: top.id,
    });
    tasks.create({ title: "Public docs" });

    const { tasks: found } = tools.searchTasks.run({ query: "RATE public", limit: 10 });
    expect(found.map((t) => t.id)).toEqual([top.id]);
    const { tasks: both } = tools.searchTasks.run({ query: "rate", limit: 10 });
    expect(both.map((t) => t.id).sort()).toEqual([top.id, sub.id].sort());
    expect(both.find((t) => t.id === sub.id)).toEqual({
      id: sub.id,
      identifier: sub.identifier,
      title: "Return 429",
      status: "todo",
      priority: "medium",
      parentId: top.id,
    });
  });

  it("honours the limit and the status filter, and flags more results", () => {
    const { tasks, tools } = setup();
    for (let i = 0; i < 4; i++)
      tasks.create({ title: `Flaky test ${i}`, status: i < 3 ? "todo" : "done" });

    const limited = tools.searchTasks.run({ query: "flaky", limit: 2 });
    expect(limited.tasks).toHaveLength(2);
    expect(limited.truncated).toBe(true);
    const done = tools.searchTasks.run({ query: "flaky", status: "done", limit: 10 });
    expect(done.tasks).toHaveLength(1);
    expect(done).not.toHaveProperty("truncated");
  });

  it("gives a hint when nothing matches", () => {
    const { tools } = setup();
    expect(tools.searchTasks.run({ query: "kubernetes", limit: 10 })).toEqual({
      tasks: [],
      hint: 'No tasks match "kubernetes". Try fewer or different words.',
    });
  });
});

describe("get_task_notes", () => {
  it("returns notes newest first, since a time, with the limit and truncation", () => {
    const { db, tasks, tools } = setup();
    const task = tasks.create({ title: "CSV export" });
    insertNote(db, { taskId: task.id, body: "old", createdAt: 1_000 });
    insertNote(db, { taskId: task.id, body: "middle", createdAt: 2_000 });
    insertNote(db, { taskId: task.id, body: "y".repeat(2000), createdAt: 3_000 });

    const all = tools.getTaskNotes.run({ taskId: task.id, limit: 20 });
    expect(all.identifier).toBe(task.identifier);
    expect(all.notes.map((n) => n.body.slice(0, 6))).toEqual(["yyyyyy", "middle", "old"]);
    expect(all.notes[0]).toMatchObject({
      createdAt: new Date(3_000).toISOString(),
      truncated: true,
    });
    expect(all.notes[0]!.body).toHaveLength(1500);
    expect(all).not.toHaveProperty("truncated");

    const recent = tools.getTaskNotes.run({ taskId: task.id, since: 2_000, limit: 1 });
    expect(recent.notes).toHaveLength(1);
    expect(recent.truncated).toBe(true);
    expect(tools.getTaskNotes.run({ taskId: task.id, since: 2_500, limit: 5 }).notes).toHaveLength(
      1,
    );
  });

  it("tells the model how to recover from an unknown task", () => {
    const { tools } = setup();
    expect(toolError(() => tools.getTaskNotes.run({ taskId: 9, limit: 20 }))).toBe(
      "Task 9 not found. Use search_tasks to find valid IDs.",
    );
  });
});

describe("computeTaskFacts", () => {
  const now = 100 * DAY;
  const row = (id: number, fields: Partial<TaskRow>): TaskRow => ({
    id,
    identifier: `PD-${id}`,
    title: `Task ${id}`,
    description: "",
    status: "todo",
    priority: "medium",
    parentId: null,
    aiState: "none",
    createdAt: now - 10 * DAY,
    updatedAt: now - 10 * DAY,
    statusChangedAt: now - 10 * DAY,
    ...fields,
  });

  it("counts days, subtasks and open blockers in code", () => {
    const tasks = [
      row(1, { status: "in_progress", statusChangedAt: now - 6 * DAY - 1 }),
      row(2, { parentId: 1, status: "done" }),
      row(3, { parentId: 1 }),
      row(4, { status: "done" }),
      row(5, {}),
      row(6, { status: "in_progress", statusChangedAt: now - 5 * DAY }),
    ];
    const blocks = [
      { fromTaskId: 1, toTaskId: 5 },
      { fromTaskId: 4, toTaskId: 5 },
      { fromTaskId: 1, toTaskId: 4 },
    ];
    const facts = new Map(computeTaskFacts(tasks, blocks, now).map((f) => [f.id, f]));

    expect(facts.get(1)).toMatchObject({
      ageDays: 10,
      daysInStatus: 6,
      subtaskDone: 1,
      subtaskTotal: 2,
      blocksOpenCount: 1,
      isBlocked: false,
      isStale: true,
    });
    expect(facts.get(5)).toMatchObject({
      isBlocked: true,
      openBlockers: [{ id: 1, identifier: "PD-1", title: "Task 1" }],
    });
    expect(facts.get(6)).toMatchObject({ daysInStatus: 5, isStale: false });
  });
});
