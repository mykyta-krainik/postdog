import {
  decomposerOutputSchema,
  decomposerRunInputSchema,
  listNotificationsResponseSchema,
  plannerInputSchema,
  plannerOutputSchema,
  statusUpdaterInputSchema,
  statusUpdaterOutputSchema,
  type AgentName,
  type DecomposerOutput,
  type DecompositionMode,
  type PlannerOutput,
  type RunStatus,
} from "@postdog/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ZodType } from "zod";
import { defineAgent } from "../../src/agents/core/definition";
import { AgentError } from "../../src/agents/core/errors";
import { mockLlm } from "../../src/agents/core/llm";
import { noopTracer } from "../../src/agents/core/tracer";
import { agentRegistry } from "../../src/agents/registry";
import { createApp } from "../../src/app";
import type { Db } from "../../src/db/client";
import { seedDatabase } from "../../src/db/seed";
import { findRun } from "../../src/repositories/agentRuns";
import { listNotifications } from "../../src/repositories/notifications";
import { insertSuggestion } from "../../src/repositories/suggestions";
import {
  WATCH_WINDOW_MS,
  createAgentRunService,
  reconcileInterruptedRuns,
} from "../../src/services/agentRuns";
import { runEndNotification } from "../../src/services/runNotifications";
import { jsonClient, setNow, type Api } from "../helpers";
import { addRun, addTask, clarificationFor, createTestDb } from "../suggestionFixtures";
import { T0, setup as decomposerSetup, twoSteps } from "./decomposerSetup";

afterEach(() => {
  vi.useRealTimers();
});

const START = 1_000_000;

const plan = (tasks: number, warnings = 0): PlannerOutput => ({
  focus: Array.from({ length: tasks }, (_, i) => ({
    taskId: i + 1,
    identifier: `PD-${i + 1}`,
    title: "Task",
    reason: "Do it",
    signals: [],
  })),
  warnings: Array.from({ length: warnings }, () => ({ message: "Check this" })),
  coordinationNotes: [],
});

/** An agent whose run lasts until the test completes or fails it, or the run is stopped. */
function gated<I, O>(name: AgentName, input: ZodType<I>, output: ZodType<O>) {
  const runs: { complete: (output: O) => void; fail: (err: Error) => void }[] = [];
  const agent = defineAgent({
    name,
    promptVersion: "TEST_PROMPT_V1",
    input,
    output,
    run: (ctx) =>
      new Promise<{ output: O }>((resolve, reject) => {
        runs.push({ complete: (o) => resolve({ output: o }), fail: reject });
        ctx.signal.addEventListener("abort", () => reject(ctx.signal.reason as Error));
      }),
  });
  return {
    agent,
    complete: (o: O) => runs.at(-1)!.complete(o),
    fail: (err: Error) => runs.at(-1)!.fail(err),
  };
}

/** The real app with gated agents and a clock the test moves. */
function setup() {
  const clock = { now: START };
  const db = createTestDb();
  const planner = gated("planner", plannerInputSchema, plannerOutputSchema);
  const statusUpdater = gated(
    "status_updater",
    statusUpdaterInputSchema,
    statusUpdaterOutputSchema,
  );
  const decomposer = gated("decomposer", decomposerRunInputSchema, decomposerOutputSchema);
  const agents = {
    ...agentRegistry,
    planner: planner.agent,
    status_updater: statusUpdater.agent,
    decomposer: decomposer.agent,
  };
  const runs = createAgentRunService({
    db,
    llm: mockLlm,
    tracer: noopTracer,
    agents,
    now: () => clock.now,
  });
  const api = jsonClient(createApp(db, { agents, runs }));
  return { db, api, runs, clock, planner, statusUpdater, decomposer };
}

async function start(api: Api, path: string, body: object = {}): Promise<number> {
  const res = await api.post(`/api/agents/${path}`).send(body).expect(202);
  return res.body.runId as number;
}

const poll = (api: Api, runId: number) => api.get(`/api/agents/runs/${runId}`).expect(200);

/** Waits for the run to end by reading the database, so the wait itself watches nothing. */
async function ended(db: Db, runId: number): Promise<RunStatus> {
  for (let i = 0; i < 400; i++) {
    const status = findRun(db, runId)?.status;
    if (status && status !== "running") return status;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Run ${runId} is still running`);
}

async function inbox(api: Api) {
  const res = await api.get("/api/notifications").expect(200);
  return listNotificationsResponseSchema.parse(res.body);
}

const kinds = async (api: Api) => (await inbox(api)).items.map((n) => [n.kind, n.runId]);

const LATER = WATCH_WINDOW_MS + 1;

describe("the watch window", () => {
  it("notifies when nobody looked at a run for longer than the window before it completed", async () => {
    const { db, api, clock, planner } = setup();
    const runId = await start(api, "planner/run");
    clock.now += LATER;
    planner.complete(plan(3));
    expect(await ended(db, runId)).toBe("completed");

    const { items, unreadCount } = await inbox(api);
    expect(items).toEqual([
      {
        id: expect.any(Number),
        kind: "run_finished",
        title: "Your plan for today is ready",
        body: "3 tasks to start with.",
        runId,
        changesetId: null,
        changeset: null,
        readAt: null,
        createdAt: START + LATER,
      },
    ]);
    expect(unreadCount).toBe(1);
  });

  it("counts starting a run as watching it, so a run that ends before the first poll stays quiet", async () => {
    const { db, api, clock, planner } = setup();
    const runId = await start(api, "planner/run");
    clock.now += WATCH_WINDOW_MS;
    planner.complete(plan(3));
    await ended(db, runId);
    expect(await kinds(api)).toEqual([]);
  });

  it("writes nothing when the run was polled within the window", async () => {
    const { db, api, clock, planner } = setup();
    const runId = await start(api, "planner/run");
    clock.now += 5_000;
    await poll(api, runId);
    clock.now += WATCH_WINDOW_MS;
    planner.complete(plan(3));
    await ended(db, runId);
    expect(await kinds(api)).toEqual([]);
  });

  it("notifies when the last poll is older than the window, as when the tab was left", async () => {
    const { db, api, clock, planner } = setup();
    const runId = await start(api, "planner/run");
    await poll(api, runId);
    clock.now += 1_500;
    await poll(api, runId);
    clock.now += LATER;
    planner.complete(plan(3));
    await ended(db, runId);
    expect(await kinds(api)).toEqual([["run_finished", runId]]);
  });

  it("does not count the run list as watching a run", async () => {
    const { db, api, clock, planner } = setup();
    const runId = await start(api, "planner/run");
    clock.now += 5_000;
    await api.get("/api/agents/runs").expect(200);
    clock.now += 5_000;
    planner.complete(plan(3));
    await ended(db, runId);
    expect(await kinds(api)).toEqual([["run_finished", runId]]);
  });

  it("forgets a run's polls once it ends, so the next run in its slot is judged on its own", async () => {
    const { db, api, clock, planner } = setup();
    const first = await start(api, "planner/run");
    await poll(api, first);
    planner.complete(plan(3));
    await ended(db, first);
    await poll(api, first);

    const second = await start(api, "planner/run");
    clock.now += LATER;
    planner.complete(plan(2));
    await ended(db, second);
    expect(await kinds(api)).toEqual([["run_finished", second]]);
  });
});

describe("failed and stopped runs", () => {
  it("notifies a Planner failure only when nobody watched", async () => {
    const { db, api, clock, planner } = setup();
    const watched = await start(api, "planner/run");
    await poll(api, watched);
    planner.fail(new AgentError("no_terminal_tool", "The model never submitted a plan."));
    expect(await ended(db, watched)).toBe("failed");

    const unwatched = await start(api, "planner/run");
    clock.now += LATER;
    planner.fail(new AgentError("no_terminal_tool", "The model never submitted a plan."));
    await ended(db, unwatched);

    expect((await inbox(api)).items).toEqual([
      expect.objectContaining({
        kind: "agent_failed",
        title: "The Planner failed",
        body: "The model never submitted a plan.",
        runId: unwatched,
      }),
    ]);
  });

  it("writes exactly one agent_failed for a Decomposer failure, watched or not", async () => {
    const { db, api, clock, decomposer } = setup();
    const watched = await start(api, "decomposer/run");
    await poll(api, watched);
    decomposer.fail(new AgentError("llm_error", "The model is down."));
    await ended(db, watched);

    const unwatched = await start(api, "decomposer/run");
    clock.now += LATER;
    decomposer.fail(new AgentError("llm_error", "The model is down."));
    await ended(db, unwatched);

    const { items } = await inbox(api);
    expect(items.map((n) => [n.kind, n.title, n.body, n.runId])).toEqual([
      ["agent_failed", "The Decomposer failed", "The model is down.", unwatched],
      ["agent_failed", "The Decomposer failed", "The model is down.", watched],
    ]);
  });

  it("never notifies a run the user cancelled, even unwatched", async () => {
    const { db, api, clock } = setup();
    const runId = await start(api, "planner/run");
    clock.now += LATER;
    await api.post(`/api/agents/runs/${runId}/cancel`).expect(200);
    expect(await ended(db, runId)).toBe("cancelled");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await kinds(api)).toEqual([]);
  });

  it("never notifies the runs the kill switch stopped", async () => {
    const { db, api, clock } = setup();
    const planner = await start(api, "planner/run");
    const decomposer = await start(api, "decomposer/run");
    clock.now += LATER;
    await api.patch("/api/settings").send({ aiEnabled: false }).expect(200);
    expect(await ended(db, planner)).toBe("cancelled");
    expect(await ended(db, decomposer)).toBe("cancelled");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await kinds(api)).toEqual([]);
  });
});

describe("restarts", () => {
  const INTERRUPTED_BODY = "The API stopped while this run was in progress.";

  it("notifies once per run a crash left running, and a second boot adds nothing", () => {
    const db = createTestDb();
    const planner = addRun(db, "planner", "running");
    const decomposer = addRun(db, "decomposer", "running");
    addRun(db, "status_updater", "completed");

    const notified = () =>
      listNotifications(db, { limit: 50 }).map((n) => [n.kind, n.title, n.body, n.runId]);
    const expected = [
      ["agent_failed", "The Decomposer failed", INTERRUPTED_BODY, decomposer],
      ["agent_failed", "The Planner failed", INTERRUPTED_BODY, planner],
    ];

    expect(reconcileInterruptedRuns(db, START)).toBe(2);
    expect(notified()).toEqual(expected);
    expect(reconcileInterruptedRuns(db, START + 1)).toBe(0);
    expect(notified()).toEqual(expected);
  });

  it("notifies the runs a clean shutdown stopped, even watched ones, and the next boot adds nothing", async () => {
    const { db, api, runs } = setup();
    const runId = await start(api, "planner/run");
    await poll(api, runId);
    await runs.interruptActive();

    expect((await inbox(api)).items).toEqual([
      expect.objectContaining({
        kind: "agent_failed",
        title: "The Planner failed",
        body: INTERRUPTED_BODY,
        runId,
      }),
    ]);
    expect(reconcileInterruptedRuns(db, START + 1)).toBe(0);
    expect((await inbox(api)).items).toHaveLength(1);
  });
});

describe("what each agent says", () => {
  const run = (
    agent: AgentName,
    status: RunStatus,
    output: unknown,
    options: { mode?: DecompositionMode; error?: AgentError } = {},
  ) => ({
    id: 7,
    agent,
    mode: options.mode ?? null,
    status,
    output,
    error: options.error?.toRunError() ?? null,
  });
  const decomposed = (
    counts: Partial<DecomposerOutput["counts"]>,
    related = 0,
  ): DecomposerOutput => ({
    tasks: [],
    related: Array.from({ length: related }, (_, i) => ({
      suggestionId: i + 1,
      relation: "overlaps" as const,
      taskIds: [1, 2],
      applied: false,
    })),
    changesetId: null,
    counts: {
      considered: 0,
      suggestedSubtasks: 0,
      appliedSubtasks: 0,
      createdSubtasks: 0,
      appliedLinks: 0,
      needsClarification: 0,
      skipped: 0,
      duplicates: 0,
      claimed: 0,
      superseded: 0,
      failed: 0,
      ...counts,
    },
    warnings: [],
  });
  const update = {
    kind: "update",
    update: {
      tone: "neutral",
      toneReason: "Steady",
      headline: "Shipped the importer, the export is next",
      done: [],
      inProgress: [],
      blockers: [],
      next: [],
    },
    warnings: [],
    text: "",
  };
  const needsNotes = {
    kind: "needs_notes",
    tasks: [
      { taskId: 3, identifier: "PD-3", title: "Importer" },
      { taskId: 7, identifier: "PD-7", title: "Export" },
    ],
    question: "What happened on these this week?",
  };

  it.each([
    [
      "a plan",
      run("planner", "completed", plan(3)),
      "Your plan for today is ready",
      "3 tasks to start with.",
    ],
    [
      "a plan with warnings",
      run("planner", "completed", plan(1, 2)),
      "Your plan for today is ready",
      "1 task to start with. 2 warnings to check.",
    ],
    [
      "a status update",
      run("status_updater", "completed", update),
      "Your status update is ready",
      "Shipped the importer, the export is next",
    ],
    [
      "a status update that needs notes",
      run("status_updater", "completed", needsNotes),
      "A status update needs a note from you",
      "PD-3 and PD-7: What happened on these this week?",
    ],
    [
      "Decomposer suggestions",
      run(
        "decomposer",
        "completed",
        decomposed({ considered: 4, suggestedSubtasks: 3, needsClarification: 1 }),
        { mode: "suggest" },
      ),
      "The Decomposer has suggestions to review",
      "3 tasks have subtasks to review, 1 task needs your answer.",
    ],
    [
      "Decomposer suggestions, a related group and a failed task",
      run(
        "decomposer",
        "completed",
        decomposed({ considered: 5, suggestedSubtasks: 1, needsClarification: 2, failed: 1 }, 1),
        { mode: "suggest" },
      ),
      "The Decomposer has suggestions to review",
      "1 task has subtasks to review, 2 tasks need your answers, 1 group of related tasks to review. 1 task was not decomposed.",
    ],
    [
      "a Decomposer run with nothing to review",
      run("decomposer", "completed", decomposed({ considered: 4, skipped: 4 }), {
        mode: "suggest",
      }),
      "The Decomposer found nothing to split",
      "It looked at 4 tasks.",
    ],
  ])("tells %s nobody watched", (_case, ended, title, body) => {
    expect(runEndNotification(ended, false, START)).toEqual({
      kind: "run_finished",
      title,
      body,
      runId: 7,
      createdAt: START,
    });
  });

  it("says nothing for a completed run someone watched, or an auto Decomposer run", () => {
    expect(runEndNotification(run("planner", "completed", plan(3)), true, START)).toBeUndefined();
    const auto = run("decomposer", "completed", decomposed({ appliedSubtasks: 2 }), {
      mode: "auto",
    });
    expect(runEndNotification(auto, false, START)).toBeUndefined();
  });

  it("names the agent that failed, and tells an interrupted run even when it was watched", () => {
    const failed = run("status_updater", "failed", null, {
      error: new AgentError("timeout", "The run took longer than 60 s."),
    });
    expect(runEndNotification(failed, true, START)).toBeUndefined();
    expect(runEndNotification(failed, false, START)).toMatchObject({
      kind: "agent_failed",
      title: "The Status updater failed",
      body: "The run took longer than 60 s.",
    });
    const interrupted = run("planner", "failed", null, {
      error: new AgentError("interrupted", "The API stopped."),
    });
    expect(runEndNotification(interrupted, true, START)).toMatchObject({
      kind: "agent_failed",
      title: "The Planner failed",
    });
  });

  it("says nothing for a cancelled run", () => {
    const cancelled = run("planner", "cancelled", null, {
      error: new AgentError("cancelled", "Cancelled by the user."),
    });
    expect(runEndNotification(cancelled, false, START)).toBeUndefined();
  });
});

/**
 * The mock model answers at once, so these runs end within the window of their start and stay
 * quiet. What each would have said unwatched is read from the stored run.
 */
describe("the real agents on the mock model", () => {
  async function finished(db: Db, api: Api, path: string, body: object = {}) {
    const runId = await start(api, path, body);
    expect(await ended(db, runId)).toBe("completed");
    const kindsLeft = (await inbox(api)).items.map((n) => n.kind);
    expect(kindsLeft).not.toContain("run_finished");
    return runEndNotification(findRun(db, runId)!, false, Date.now());
  }

  it.each([
    ["planner/run", {}, "Your plan for today is ready", "3 tasks to start with."],
    [
      "status-updater/run",
      { scope: "since" },
      "Your status update is ready",
      "2 of 3 done, nearly there",
    ],
  ])("tells a %s on the seeded data", async (path, body, title, text) => {
    setNow(T0);
    const db = createTestDb();
    seedDatabase(db, Date.now());
    const api = jsonClient(createApp(db));
    expect(await finished(db, api, path, body)).toMatchObject({
      kind: "run_finished",
      title,
      body: text,
    });
  });

  it("sums up a suggest-mode Decomposer run on the seeded data", async () => {
    setNow(T0);
    const { db, api } = decomposerSetup({ seed: true });
    expect(await finished(db, api, "decomposer/run")).toMatchObject({
      kind: "run_finished",
      title: "The Decomposer has suggestions to review",
      body: "5 tasks have subtasks to review, 2 tasks need your answers, 1 group of related tasks to review.",
    });
  });

  it("leaves an auto-mode Decomposer run to its own summary", async () => {
    setNow(T0);
    const { db, api } = decomposerSetup({ seed: true });
    await api.patch("/api/settings").send({ decompositionMode: "auto" }).expect(200);
    expect(await finished(db, api, "decomposer/run")).toBeUndefined();
    expect((await inbox(api)).items.map((n) => n.kind)).toContain("auto_decomposition");
  });

  it("tells a clarify rerun in suggest mode", async () => {
    setNow(T0);
    const { db, api } = decomposerSetup({ task: twoSteps });
    const task = addTask(db, { title: "Improve performance" });
    const suggestion = insertSuggestion(db, clarificationFor(addRun(db), task.id, Date.now()));
    const body = { suggestionId: suggestion.id, generateAnyway: true };
    expect(await finished(db, api, "decomposer/clarify", body)).toMatchObject({
      kind: "run_finished",
      title: "The Decomposer has suggestions to review",
      body: "1 task has subtasks to review.",
    });
  });
});
