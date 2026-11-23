import { taskDetailSchema } from "@postdog/shared";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import {
  findSuggestion,
  insertSuggestion,
  resolveSuggestion,
} from "../src/repositories/suggestions";
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
import { jsonClient } from "./helpers";

const NOW = 50 * DAY;

function setup() {
  const db = createTestDb();
  return {
    db,
    api: jsonClient(createApp(db)),
    run: addRun(db),
    a: addTask(db),
    b: addTask(db),
    c: addTask(db),
  };
}

describe("task detail", () => {
  it("returns the task's pending suggestions, oldest first", async () => {
    const { db, api, run, a, b } = setup();
    const related = insertSuggestion(db, relatedOf(run, [a.id, b.id], NOW + 2));
    const subtasks = insertSuggestion(db, subtasksFor(run, b.id, NOW + 1));
    const rejected = insertSuggestion(db, clarificationFor(run, b.id, NOW + 3));
    resolveSuggestion(db, rejected.id, "rejected", NOW + 4);

    const res = await api.get(`/api/tasks/${b.id}`).expect(200);
    const detail = taskDetailSchema.parse(res.body);
    expect(detail.pendingSuggestions).toEqual([subtasks, related]);
    expect(detail.aiState).toBe("suggestion_pending");

    const other = taskDetailSchema.parse((await api.get(`/api/tasks/${a.id}`).expect(200)).body);
    expect(other.pendingSuggestions).toEqual([related]);
  });
});

describe("task delete", () => {
  it("supersedes the pending suggestions of the task and its subtasks", async () => {
    const { db, api, run, a, b, c } = setup();
    const sub = addTask(db, { parentId: c.id });
    const related = insertSuggestion(db, relatedOf(run, [a.id, b.id], NOW));
    const ofSubtask = insertSuggestion(db, relatedOf(run, [sub.id, a.id], NOW));

    await api.delete(`/api/tasks/${b.id}`).expect(204);
    expect(findSuggestion(db, related.id)?.status).toBe("superseded");
    expect(findSuggestion(db, ofSubtask.id)?.status).toBe("pending");
    expect(aiStateOf(db, a.id)).toBe("suggestion_pending");

    await api.delete(`/api/tasks/${c.id}`).expect(204);
    expect(findSuggestion(db, ofSubtask.id)?.status).toBe("superseded");
    expect(aiStateOf(db, a.id)).toBe("none");

    await api.delete(`/api/tasks/999`).expect(404);
  });
});
