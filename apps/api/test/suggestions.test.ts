import { describe, expect, it } from "vitest";
import {
  findSuggestion,
  insertSuggestion,
  listPendingSuggestionsOfTask,
  listSuggestions,
  listTaskIdsInCooldown,
  markSuggestionsRolledBack,
  resolveSuggestion,
  type NewSuggestion,
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

const NOW = 50 * DAY;

function setup() {
  const db = createTestDb();
  return { db, run: addRun(db), a: addTask(db), b: addTask(db), c: addTask(db) };
}

describe("insertSuggestion", () => {
  it("stores a pending suggestion and returns it parsed", () => {
    const { db, run, a } = setup();
    const saved = insertSuggestion(db, subtasksFor(run, a.id, NOW));
    expect(saved).toEqual({
      id: saved.id,
      ...subtasksFor(run, a.id, NOW),
      status: "pending",
      resolvedAt: null,
    });
    expect(findSuggestion(db, saved.id)).toEqual(saved);
  });

  it("stores an auto-applied suggestion resolved at once, with no orange dot", () => {
    const { db, run, a, b, c } = setup();
    const applied = insertSuggestion(db, { ...subtasksFor(run, a.id, NOW), status: "applied" });
    const linked = insertSuggestion(db, {
      ...relatedOf(run, [a.id, b.id], NOW),
      status: "applied",
    });
    insertSuggestion(db, subtasksFor(run, c.id, NOW));

    expect(applied).toMatchObject({ status: "applied", resolvedAt: NOW });
    expect(findSuggestion(db, linked.id)).toMatchObject({ status: "applied", resolvedAt: NOW });
    expect([a, b, c].map((t) => aiStateOf(db, t.id))).toEqual([
      "none",
      "none",
      "suggestion_pending",
    ]);
    expect(listPendingSuggestionsOfTask(db, a.id)).toEqual([]);
  });

  it("rejects a payload its kind's schema rejects and stores nothing", () => {
    const { db, run, a } = setup();
    const invalid = { ...subtasksFor(run, a.id, NOW), payload: { subtasks: [], rationale: "" } };
    expect(() => insertSuggestion(db, invalid as NewSuggestion)).toThrow();
    expect(listSuggestions(db, {})).toEqual([]);
    expect(aiStateOf(db, a.id)).toBe("none");
  });
});

describe("listSuggestions", () => {
  it("filters by status and by task, counting related groups, oldest first", () => {
    const { db, run, a, b, c } = setup();
    const related = insertSuggestion(db, relatedOf(run, [a.id, b.id], NOW + 2));
    const forB = insertSuggestion(db, subtasksFor(run, b.id, NOW + 1));
    const forC = insertSuggestion(db, clarificationFor(run, c.id, NOW + 3));
    resolveSuggestion(db, forC.id, "rejected", NOW + 4);

    const ids = (filter: Parameters<typeof listSuggestions>[1]) =>
      listSuggestions(db, filter).map((s) => s.id);
    expect(ids({})).toEqual([forB.id, related.id, forC.id]);
    expect(ids({ status: "pending" })).toEqual([forB.id, related.id]);
    expect(ids({ targetType: "task", targetId: b.id })).toEqual([forB.id, related.id]);
    expect(ids({ targetId: a.id })).toEqual([related.id]);
    expect(ids({ targetId: c.id, status: "pending" })).toEqual([]);
    expect(ids({ targetType: "doc" })).toEqual([]);
  });

  it("listPendingSuggestionsOfTask returns the task's pending suggestions only", () => {
    const { db, run, a, b } = setup();
    const related = insertSuggestion(db, relatedOf(run, [a.id, b.id], NOW));
    const rejected = insertSuggestion(db, subtasksFor(run, b.id, NOW + 1));
    resolveSuggestion(db, rejected.id, "rejected", NOW + 2);
    insertSuggestion(db, clarificationFor(run, a.id, NOW + 3));

    expect(listPendingSuggestionsOfTask(db, b.id)).toEqual([related]);
  });
});

describe("resolveSuggestion", () => {
  it("resolves a pending suggestion once and stamps resolvedAt", () => {
    const { db, run, a } = setup();
    const saved = insertSuggestion(db, subtasksFor(run, a.id, NOW));

    expect(resolveSuggestion(db, saved.id, "applied", NOW + 5)).toEqual({
      ...saved,
      status: "applied",
      resolvedAt: NOW + 5,
    });
    expect(resolveSuggestion(db, saved.id, "rejected", NOW + 6)).toBeUndefined();
    expect(findSuggestion(db, saved.id)?.status).toBe("applied");
    expect(resolveSuggestion(db, 999, "rejected", NOW)).toBeUndefined();
    expect(aiStateOf(db, a.id)).toBe("none");
  });
});

describe("listTaskIdsInCooldown", () => {
  it("holds tasks with a suggestion rejected or rolled back in the last 7 days", () => {
    const { db, run, a, b, c } = setup();
    const d = addTask(db);
    const e = addTask(db);
    const resolve = (
      s: NewSuggestion,
      status: "rejected" | "rolled_back" | "superseded",
      at: number,
    ) => resolveSuggestion(db, insertSuggestion(db, s).id, status, at);

    resolve(subtasksFor(run, a.id, NOW), "rejected", NOW - 6 * DAY);
    resolve(subtasksFor(run, b.id, NOW), "rolled_back", NOW - 1);
    resolve(clarificationFor(run, c.id, NOW), "rejected", NOW - 7 * DAY);
    resolve(clarificationFor(run, d.id, NOW), "superseded", NOW - 1);
    insertSuggestion(db, subtasksFor(run, e.id, NOW));

    expect(listTaskIdsInCooldown(db, NOW)).toEqual(new Set([a.id, b.id]));
  });

  it("does not hold a task whose suggestion was applied", () => {
    const { db, run, a } = setup();
    insertSuggestion(db, { ...subtasksFor(run, a.id, NOW), status: "applied" });
    expect(listTaskIdsInCooldown(db, NOW + 1)).toEqual(new Set());
  });

  it("holds every task of a rejected related group", () => {
    const { db, run, a, b, c } = setup();
    const related = insertSuggestion(db, relatedOf(run, [b.id, c.id], NOW, "duplicates"));
    resolveSuggestion(db, related.id, "rejected", NOW);
    expect(listTaskIdsInCooldown(db, NOW + DAY)).toEqual(new Set([b.id, c.id]));
    expect(listTaskIdsInCooldown(db, NOW + DAY).has(a.id)).toBe(false);
  });
});

describe("markSuggestionsRolledBack", () => {
  const applied = (s: NewSuggestion): NewSuggestion => ({ ...s, status: "applied" });

  it("rolls back the run's applied suggestions for the listed targets only", () => {
    const { db, run, a, b, c } = setup();
    const other = addRun(db);
    const d = addTask(db);
    const forA = insertSuggestion(db, applied(subtasksFor(run, a.id, NOW)));
    const forB = insertSuggestion(db, applied(subtasksFor(run, b.id, NOW)));
    const pendingC = insertSuggestion(db, subtasksFor(run, c.id, NOW));
    const otherRunD = insertSuggestion(db, applied(subtasksFor(other, d.id, NOW)));

    const rolledBack = markSuggestionsRolledBack(db, {
      runId: run,
      targetIds: [a.id, c.id, d.id],
      now: NOW + 5,
    });

    expect(rolledBack).toEqual([{ ...forA, status: "rolled_back", resolvedAt: NOW + 5 }]);
    expect([forB, pendingC, otherRunD].map((s) => findSuggestion(db, s.id)?.status)).toEqual([
      "applied",
      "pending",
      "applied",
    ]);
    expect(aiStateOf(db, c.id)).toBe("suggestion_pending");
  });

  it("starts the 7-day cooldown for the rolled-back tasks", () => {
    const { db, run, a, b } = setup();
    insertSuggestion(db, applied(subtasksFor(run, a.id, NOW)));
    insertSuggestion(db, applied(subtasksFor(run, b.id, NOW)));
    markSuggestionsRolledBack(db, { runId: run, targetIds: [a.id], now: NOW + DAY });

    expect(listTaskIdsInCooldown(db, NOW + DAY)).toEqual(new Set([a.id]));
    expect(listTaskIdsInCooldown(db, NOW + 8 * DAY - 1)).toEqual(new Set([a.id]));
    expect(listTaskIdsInCooldown(db, NOW + 8 * DAY)).toEqual(new Set());
  });

  it("puts every task of a rolled-back related group in the cooldown", () => {
    const { db, run, a, b, c } = setup();
    insertSuggestion(db, applied(relatedOf(run, [b.id, c.id], NOW)));
    markSuggestionsRolledBack(db, { runId: run, targetIds: [b.id], now: NOW });
    expect(listTaskIdsInCooldown(db, NOW + 1)).toEqual(new Set([b.id, c.id]));
    expect(listTaskIdsInCooldown(db, NOW + 1).has(a.id)).toBe(false);
  });

  it("does nothing for an empty target list or a second call", () => {
    const { db, run, a } = setup();
    insertSuggestion(db, applied(subtasksFor(run, a.id, NOW)));
    expect(markSuggestionsRolledBack(db, { runId: run, targetIds: [], now: NOW })).toEqual([]);
    expect(markSuggestionsRolledBack(db, { runId: run, targetIds: [a.id], now: NOW })).toHaveLength(
      1,
    );
    expect(markSuggestionsRolledBack(db, { runId: run, targetIds: [a.id], now: NOW })).toEqual([]);
  });
});
