import { plannerInputSchema, plannerOutputSchema, type DecompositionMode } from "@postdog/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app";
import { defineAgent } from "../../src/agents/core/definition";
import { AgentError } from "../../src/agents/core/errors";
import type { MockConversation, MockTurn } from "../../src/agents/core/llm";
import { autoRunMessage, conflictMessage } from "../../src/agents/decomposer/notify";
import { agentRegistry } from "../../src/agents/registry";
import type { Db } from "../../src/db/client";
import { taskLinks } from "../../src/db/schema";
import { findRun } from "../../src/repositories/agentRuns";
import { findChangesetByRun } from "../../src/repositories/changesets";
import { listActiveClaims } from "../../src/repositories/claims";
import { findLink } from "../../src/repositories/links";
import { listNotifications } from "../../src/repositories/notifications";
import {
  findSuggestion,
  insertSuggestion,
  listSuggestions,
} from "../../src/repositories/suggestions";
import { listAllTasks } from "../../src/repositories/tasks";
import { type Api, jsonClient, setNow } from "../helpers";
import { addRun, addTask, aiStateOf, clarificationFor, createTestDb } from "../suggestionFixtures";
import {
  T0,
  clarify,
  noGroups,
  outcomes,
  outputOf,
  runDecomposer,
  setup,
  twoSteps,
} from "./decomposerSetup";
import { call, waitForRun } from "./helpers";

afterEach(() => {
  vi.useRealTimers();
});

const setMode = (api: Api, decompositionMode: DecompositionMode) =>
  api.patch("/api/settings").send({ decompositionMode }).expect(200);

const notifications = (db: Db) => listNotifications(db, { limit: 50 });

const subtasksOf = (db: Db, parentId: number) =>
  listAllTasks(db)
    .filter((t) => t.parentId === parentId)
    .sort((a, b) => a.id - b.id);

async function until(check: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

function batchIds(conversation: MockConversation): number[] {
  return [...conversation.userMessage.matchAll(/^(\d+) \| PD-\d+ \|/gm)].map((m) => Number(m[1]));
}

const hangs = () => new Promise<MockTurn>(() => {});

describe("Decomposer in auto mode on the seeded data", () => {
  it("creates the proposed subtasks, leaves questions and duplicates for the user, and sums it up in one notification", async () => {
    setNow(T0);
    const { db, api } = setup({ seed: true });
    await setMode(api, "auto");
    const updatedBefore = new Map(listAllTasks(db).map((t) => [t.id, t.updatedAt]));
    const duplicateLinks = db
      .select()
      .from(taskLinks)
      .all()
      .filter((l) => l.type === "duplicates");

    const run = await runDecomposer(api);
    expect(run.mode).toBe("auto");
    const output = outputOf(run);
    expect(outcomes(output)).toEqual({
      "Add an audit log for admin actions": "applied_subtasks",
      "Publish OpenAPI docs for the public API": "applied_subtasks",
      "Upgrade services to Node 22": "applied_subtasks",
      "Remove stale feature flags": "applied_subtasks",
      "Support dark mode in transactional emails": "applied_subtasks",
      "Improve performance": "needs_clarification",
      "Fix the onboarding thing": "needs_clarification",
      "Reindex search after the schema change": "skipped",
      "Add rate limiting to the public API": "duplicate",
      "Rate-limit public API endpoints": "duplicate",
    });
    const changeset = findChangesetByRun(db, run.id)!;
    expect(output.changesetId).toBe(changeset.id);
    expect(output.counts).toMatchObject({
      considered: 10,
      suggestedSubtasks: 0,
      appliedSubtasks: 5,
      createdSubtasks: 15,
      appliedLinks: 0,
      needsClarification: 2,
      duplicates: 2,
    });

    for (const result of output.tasks.filter((t) => t.outcome === "applied_subtasks")) {
      expect(result.detail).toBe("Created 3 subtasks");
      const suggestion = findSuggestion(db, result.suggestionId!)!;
      expect(suggestion).toMatchObject({ kind: "subtasks", status: "applied", runId: run.id });
      expect(suggestion.resolvedAt).toBe(suggestion.createdAt);
      if (suggestion.kind !== "subtasks") throw new Error("not a subtasks suggestion");
      const created = subtasksOf(db, result.taskId);
      expect(created.map((s) => [s.title, s.description, s.priority, s.status])).toEqual(
        suggestion.payload.subtasks.map((s) => [
          s.title,
          s.description,
          s.priority ?? "medium",
          "todo",
        ]),
      );
      expect(changeset.ops.filter((op) => op.taskId === result.taskId)).toEqual(
        created.map((s) => ({
          type: "create_task",
          id: s.id,
          taskId: result.taskId,
          state: "applied",
        })),
      );
      expect(listAllTasks(db).find((t) => t.id === result.taskId)?.updatedAt).toBe(
        updatedBefore.get(result.taskId),
      );
      expect(aiStateOf(db, result.taskId)).toBe("none");
    }
    const byTitle = new Map(output.tasks.map((t) => [t.title, t]));
    const vague = byTitle.get("Improve performance")!;
    expect(findSuggestion(db, vague.suggestionId!)?.status).toBe("pending");
    expect(aiStateOf(db, vague.taskId)).toBe("clarification_pending");
    expect(output.related).toEqual([
      expect.objectContaining({ relation: "duplicates", applied: false }),
    ]);
    expect(findSuggestion(db, output.related[0]!.suggestionId)?.status).toBe("pending");
    expect(
      db
        .select()
        .from(taskLinks)
        .all()
        .filter((l) => l.type === "duplicates"),
    ).toEqual(duplicateLinks);
    expect(listActiveClaims(db, Date.now())).toEqual([]);

    expect(notifications(db)).toEqual([
      expect.objectContaining({
        kind: "auto_decomposition",
        title: "Split 5 tasks into 15 subtasks",
        body: "Split 5 tasks into 15 subtasks, 2 tasks need your answers, 2 tasks may be duplicates.",
        runId: run.id,
        changesetId: changeset.id,
        changeset: expect.objectContaining({ counts: { subtasks: 15, links: 0 } }),
      }),
    ]);

    const again = outputOf(await runDecomposer(api));
    expect(outcomes(again)).toEqual({ "Reindex search after the schema change": "skipped" });
    expect(again.changesetId).toBeNull();
    expect(notifications(db)).toHaveLength(1);
  });

  it("never edits, deletes or re-prioritizes an existing task or link (hard limits)", async () => {
    const { db, api } = setup({
      seed: true,
      related: [
        (conversation) =>
          call("report_related", {
            groups: [
              {
                relation: "overlaps",
                taskIds: batchIds(conversation).slice(0, 3),
                reason: "Shared.",
              },
            ],
          }),
      ],
    });
    await setMode(api, "auto");
    const withoutAiState = (task: ReturnType<typeof listAllTasks>[number]) => ({
      ...task,
      aiState: "ignored",
    });
    const tasksBefore = listAllTasks(db).map(withoutAiState);
    const linksBefore = db.select().from(taskLinks).all();

    const run = await runDecomposer(api);
    const output = outputOf(run);
    expect(output.counts).toMatchObject({ appliedSubtasks: 7, appliedLinks: 2 });
    const ops = findChangesetByRun(db, run.id)!.ops;

    const tasksAfter = listAllTasks(db).map(withoutAiState);
    const existing = new Set(tasksBefore.map((t) => t.id));
    expect(tasksAfter.filter((t) => existing.has(t.id))).toEqual(tasksBefore);
    const added = tasksAfter.filter((t) => !existing.has(t.id));
    expect(added.map((t) => t.id)).toEqual(
      ops.filter((op) => op.type === "create_task").map((op) => op.id),
    );
    const split = new Set(
      output.tasks.filter((t) => t.outcome === "applied_subtasks").map((t) => t.taskId),
    );
    for (const task of added) {
      expect(split.has(task.parentId!)).toBe(true);
      expect(task.status).toBe("todo");
    }

    const linksAfter = db.select().from(taskLinks).all();
    const oldLinks = new Set(linksBefore.map((l) => l.id));
    expect(linksAfter.filter((l) => oldLinks.has(l.id))).toEqual(linksBefore);
    const newLinks = linksAfter.filter((l) => !oldLinks.has(l.id));
    expect(newLinks.map((l) => l.id)).toEqual(
      ops.filter((op) => op.type === "create_link").map((op) => op.id),
    );
    for (const link of newLinks) {
      expect(link).toMatchObject({ type: "relates", createdBy: `agent:${run.id}` });
    }
  });
});

describe("Decomposer auto apply", () => {
  it("writes nothing of a task whose transaction fails and still applies the others", async () => {
    const { db, api } = setup({ related: [noGroups], task: twoSteps });
    const ok = addTask(db, { title: "Works" });
    const broken = addTask(db, { title: "Breaks on save" });
    db.$client.exec(`
      CREATE TRIGGER fail_one_suggestion BEFORE INSERT ON agent_suggestions
      WHEN NEW.target_id = ${broken.id} AND NEW.kind = 'subtasks'
      BEGIN SELECT RAISE(ABORT, 'injected failure'); END;
    `);
    await setMode(api, "auto");

    const run = await runDecomposer(api);
    const output = outputOf(run);
    expect(output.tasks.find((t) => t.taskId === broken.id)).toMatchObject({
      outcome: "failed",
      suggestionId: null,
      detail: "The agent crashed: injected failure",
    });
    expect(subtasksOf(db, broken.id)).toEqual([]);
    expect(listSuggestions(db, { targetId: broken.id })).toEqual([]);
    expect(aiStateOf(db, broken.id)).toBe("none");

    expect(subtasksOf(db, ok.id).map((s) => s.title)).toEqual(["Step one", "Step two"]);
    const changeset = findChangesetByRun(db, run.id)!;
    expect(changeset.ops.map((op) => op.taskId)).toEqual([ok.id, ok.id]);
    expect(output.counts).toMatchObject({ appliedSubtasks: 1, createdSubtasks: 2, failed: 1 });
  });

  it("links an overlaps group as a star from the lowest id, skips a pair already linked, and leaves duplicates pending", async () => {
    let groups: unknown[] = [];
    const { db, api } = setup({
      related: [() => call("report_related", { groups })],
      task: twoSteps,
    });
    const [a, b, c, d, e] = ["A", "B", "C", "D", "E"].map((title) => addTask(db, { title }));
    await api
      .post(`/api/tasks/${b!.id}/links`)
      .send({ toTaskId: a!.id, type: "relates" })
      .expect(201);
    groups = [
      { relation: "overlaps", taskIds: [c!.id, a!.id, b!.id], reason: "Same flow." },
      { relation: "duplicates", taskIds: [e!.id, d!.id], reason: "Same work." },
    ];
    await setMode(api, "auto");

    const run = await runDecomposer(api);
    const output = outputOf(run);
    const [overlaps, duplicates] = output.related;
    expect(output.related).toEqual([
      {
        suggestionId: expect.any(Number),
        relation: "overlaps",
        taskIds: [a!.id, b!.id, c!.id],
        applied: true,
      },
      {
        suggestionId: expect.any(Number),
        relation: "duplicates",
        taskIds: [d!.id, e!.id],
        applied: false,
      },
    ]);
    const link = findLink(db, a!.id, c!.id, "relates")!;
    expect(link.createdBy).toBe(`agent:${run.id}`);
    expect(findLink(db, a!.id, b!.id, "relates")).toBeUndefined();
    expect(db.select().from(taskLinks).all()).toHaveLength(2);
    expect(findSuggestion(db, overlaps!.suggestionId)).toMatchObject({
      status: "applied",
      targetId: a!.id,
    });
    expect(findSuggestion(db, duplicates!.suggestionId)?.status).toBe("pending");
    expect(findLink(db, e!.id, d!.id, "duplicates")).toBeUndefined();
    expect([aiStateOf(db, a!.id), aiStateOf(db, d!.id)]).toEqual(["none", "suggestion_pending"]);

    const changeset = findChangesetByRun(db, run.id)!;
    expect(changeset.ops.filter((op) => op.type === "create_link")).toEqual([
      { type: "create_link", id: link.id, taskId: a!.id, state: "applied" },
    ]);
    expect(output.counts).toMatchObject({
      appliedSubtasks: 3,
      createdSubtasks: 6,
      appliedLinks: 1,
    });
    expect(notifications(db).map((n) => n.body)).toEqual([
      "Split 3 tasks into 6 subtasks, linked 3 related tasks, 2 tasks may be duplicates.",
    ]);
  });

  it("skips a task edited during the run and lists it in one conflict notification", async () => {
    setNow(T0);
    let edited = 0;
    let deleted = 0;
    const { db, api } = setup({
      related: [noGroups],
      task: async (id) => {
        setNow(T0 + 1_000);
        if (id === edited)
          await api.patch(`/api/tasks/${id}`).send({ title: "Edited" }).expect(200);
        if (id === deleted) await api.delete(`/api/tasks/${id}`).expect(204);
        return twoSteps();
      },
    });
    const kept = addTask(db, { title: "Kept" });
    const task = addTask(db, { title: "Original" });
    edited = task.id;
    deleted = addTask(db, { title: "Deleted" }).id;
    await setMode(api, "auto");

    const run = await runDecomposer(api);
    const output = outputOf(run);
    expect(output.tasks.find((t) => t.taskId === edited)).toMatchObject({
      outcome: "superseded",
      suggestionId: null,
      detail: `${task.identifier} was edited while the Decomposer worked`,
    });
    expect(subtasksOf(db, edited)).toEqual([]);
    expect(listSuggestions(db, { targetId: edited })).toEqual([]);
    expect(subtasksOf(db, kept.id)).toHaveLength(2);
    expect(output.counts).toMatchObject({ superseded: 2, appliedSubtasks: 1 });

    expect(notifications(db)).toEqual([
      expect.objectContaining({
        kind: "auto_decomposition",
        title: "Split 1 task into 2 subtasks",
      }),
      expect.objectContaining({
        kind: "conflict",
        title: `${task.identifier} was edited during the run`,
        body: `The Decomposer skipped ${task.identifier} because it was edited during the run. Nothing was changed; it can be decomposed again.`,
        runId: run.id,
        changesetId: null,
      }),
    ]);
  });

  it("writes no notification for a task edited during a suggest run", async () => {
    setNow(T0);
    const { db, api } = setup({
      task: async (id) => {
        setNow(T0 + 1_000);
        await api.patch(`/api/tasks/${id}`).send({ title: "Edited" }).expect(200);
        return twoSteps();
      },
    });
    const edited = addTask(db, { title: "Original" }).id;

    const output = outputOf(await runDecomposer(api));
    expect(output.tasks.map((t) => [t.taskId, t.outcome])).toEqual([[edited, "superseded"]]);
    expect(notifications(db)).toEqual([]);
  });

  it("keeps the mode it started with when Settings change during the run", async () => {
    let flipTo: DecompositionMode = "suggest";
    const { db, api } = setup({
      task: async () => {
        await setMode(api, flipTo);
        return twoSteps();
      },
    });
    const first = addTask(db, { title: "First" });
    await setMode(api, "auto");
    const autoRun = await runDecomposer(api, { taskIds: [first.id] });
    expect(autoRun.mode).toBe("auto");
    expect(outputOf(autoRun).tasks[0]!.outcome).toBe("applied_subtasks");
    expect(subtasksOf(db, first.id)).toHaveLength(2);

    flipTo = "auto";
    const second = addTask(db, { title: "Second" });
    const suggestRun = await runDecomposer(api, { taskIds: [second.id] });
    expect(suggestRun.mode).toBe("suggest");
    expect(outputOf(suggestRun).tasks[0]!.outcome).toBe("suggested_subtasks");
    expect(subtasksOf(db, second.id)).toEqual([]);
  });

  for (const [how, stop] of [
    [
      "cancelled",
      (api: Api, runId: number) => api.post(`/api/agents/runs/${runId}/cancel`).expect(200),
    ],
    [
      "stopped by the kill switch",
      (api: Api) => api.patch("/api/settings").send({ aiEnabled: false }).expect(200),
    ],
  ] as const) {
    it(`keeps what it applied and still notifies when it is ${how}`, async () => {
      let slow = 0;
      const { db, api } = setup({
        related: [noGroups],
        task: (id) => (id === slow ? hangs() : twoSteps()),
      });
      const quick = addTask(db, { title: "Quick" });
      slow = addTask(db, { title: "Slow" }).id;
      await setMode(api, "auto");

      const res = await api.post("/api/agents/decomposer/run").send({}).expect(202);
      const runId = res.body.runId as number;
      await until(() => subtasksOf(db, quick.id).length === 2, "the quick task's subtasks");
      await stop(api, runId);
      expect(findRun(db, runId)?.status).toBe("cancelled");
      await until(() => notifications(db).length > 0, "the notification");

      expect(subtasksOf(db, quick.id)).toHaveLength(2);
      expect(subtasksOf(db, slow)).toEqual([]);
      const changeset = findChangesetByRun(db, runId)!;
      expect(changeset.ops).toHaveLength(2);
      expect(notifications(db)).toEqual([
        expect.objectContaining({
          kind: "auto_decomposition",
          title: "Split 1 task into 2 subtasks",
          body: "Split 1 task into 2 subtasks. The run stopped before it finished; what it did is kept.",
          changesetId: changeset.id,
        }),
      ]);
      expect(listActiveClaims(db, Date.now())).toEqual([]);
    });
  }

  it("applies a clarify rerun in auto mode and supersedes the clarification", async () => {
    const { db, api } = setup();
    const task = addTask(db, { title: "Improve performance" });
    const clarification = insertSuggestion(db, clarificationFor(addRun(db), task.id, Date.now()));
    await setMode(api, "auto");

    const run = await clarify(api, {
      suggestionId: clarification.id,
      answers: [
        { question: "Which users does this cover?", answer: "cut the projects page load to 1 s" },
      ],
    });
    expect(run.mode).toBe("auto");
    const output = outputOf(run);
    expect(output.tasks).toEqual([
      expect.objectContaining({
        taskId: task.id,
        outcome: "applied_subtasks",
        detail: "Created 3 subtasks",
      }),
    ]);
    expect(subtasksOf(db, task.id).map((s) => s.title)).toEqual([
      "Plan: Improve performance",
      "Cut the projects page load to 1 s",
      "Test and roll out: Improve performance",
    ]);
    expect(findSuggestion(db, clarification.id)?.status).toBe("superseded");
    expect(findSuggestion(db, output.tasks[0]!.suggestionId!)?.status).toBe("applied");
    expect(aiStateOf(db, task.id)).toBe("none");
    const changeset = findChangesetByRun(db, run.id)!;
    expect(output.changesetId).toBe(changeset.id);
    expect(changeset.ops.map((op) => op.taskId)).toEqual([task.id, task.id, task.id]);
    expect(notifications(db).map((n) => [n.kind, n.title, n.changesetId])).toEqual([
      ["auto_decomposition", "Split 1 task into 3 subtasks", changeset.id],
    ]);
  });
});

describe("Decomposer failure notifications", () => {
  it("writes one agent_failed notification when a run fails, and no summary when nothing was applied", async () => {
    const { db, api } = setup({ task: () => ({ text: "No." }) });
    addTask(db, { title: "Only" });
    await setMode(api, "auto");

    const run = await runDecomposer(api);
    expect(run.status).toBe("failed");
    expect(notifications(db)).toEqual([
      expect.objectContaining({
        kind: "agent_failed",
        title: "The Decomposer failed",
        body: run.error!.message,
        runId: run.id,
        changesetId: null,
      }),
    ]);
  });

  it("writes none when the run is cancelled", async () => {
    const { db, api } = setup({ task: hangs });
    addTask(db, { title: "Only" });
    const res = await api.post("/api/agents/decomposer/run").send({}).expect(202);
    const runId = res.body.runId as number;
    await until(() => listActiveClaims(db, Date.now()).length > 0, "the claim");
    await api.post(`/api/agents/runs/${runId}/cancel`).expect(200);
    expect((await waitForRun(api, runId)).status).toBe("cancelled");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(notifications(db)).toEqual([]);
  });

  it("writes none for a failed Planner run", async () => {
    const db = createTestDb();
    const planner = defineAgent({
      name: "planner",
      promptVersion: "TEST_PROMPT_V1",
      input: plannerInputSchema,
      output: plannerOutputSchema,
      run: () => Promise.reject(new AgentError("no_terminal_tool", "No plan.")),
    });
    const api = jsonClient(createApp(db, { agents: { ...agentRegistry, planner } }));
    const res = await api.post("/api/agents/planner/run").send({}).expect(202);
    expect((await waitForRun(api, res.body.runId as number)).status).toBe("failed");
    expect(notifications(db)).toEqual([]);
  });
});

describe("auto run messages", () => {
  const tally = (
    splitTasks: number,
    createdSubtasks: number,
    linkedTasks: number,
    needAnswers: number,
    duplicateTasks: number,
  ) => ({
    splitTasks,
    createdSubtasks,
    linkedTasks,
    needAnswers,
    duplicateTasks,
  });

  it.each([
    [
      tally(4, 13, 2, 2, 0),
      false,
      "Split 4 tasks into 13 subtasks",
      "Split 4 tasks into 13 subtasks, linked 2 related tasks, 2 tasks need your answers.",
    ],
    [
      tally(1, 2, 0, 1, 0),
      false,
      "Split 1 task into 2 subtasks",
      "Split 1 task into 2 subtasks, 1 task needs your answers.",
    ],
    [
      tally(0, 0, 0, 2, 2),
      false,
      "2 tasks need your answers",
      "2 tasks need your answers, 2 tasks may be duplicates.",
    ],
    [tally(0, 0, 0, 0, 1), false, "1 task may be a duplicate", "1 task may be a duplicate."],
    [
      tally(0, 0, 3, 0, 0),
      true,
      "Linked 3 related tasks",
      "Linked 3 related tasks. The run stopped before it finished; what it did is kept.",
    ],
  ])("%o, stopped %s: %s", (counts, stopped, title, body) => {
    expect(autoRunMessage(counts, stopped)).toEqual({ title, body });
  });

  it("is null when the run applied nothing and left nothing for the user", () => {
    expect(autoRunMessage(tally(0, 0, 0, 0, 0), true)).toBeNull();
  });

  it("names one edited task, or counts several", () => {
    expect(conflictMessage([])).toBeNull();
    expect(conflictMessage(["PD-7"])).toEqual({
      title: "PD-7 was edited during the run",
      body: "The Decomposer skipped PD-7 because it was edited during the run. Nothing was changed; it can be decomposed again.",
    });
    expect(conflictMessage(["PD-7", "PD-9", "PD-12"])).toEqual({
      title: "3 tasks were edited during the run",
      body: "The Decomposer skipped PD-7, PD-9 and PD-12 because they were edited during the run. Nothing was changed; they can be decomposed again.",
    });
  });
});
