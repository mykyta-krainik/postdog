import { AGENT_LIMITS, apiErrorBodySchema, taskDetailSchema } from "@postdog/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MockConversation, MockTurn } from "../../src/agents/core/llm";
import { findActiveClaim, listActiveClaims, tryClaim } from "../../src/repositories/claims";
import {
  findSuggestion,
  insertSuggestion,
  listSuggestions,
  resolveSuggestion,
} from "../../src/repositories/suggestions";
import { findTask } from "../../src/repositories/tasks";
import { setNow, type Api } from "../helpers";
import {
  DAY,
  addRun,
  addTask,
  aiStateOf,
  clarificationFor,
  createTestDb,
  relatedOf,
  subtasksFor,
} from "../suggestionFixtures";
import {
  T0,
  ask,
  clarify,
  noGroups,
  outcomes,
  outputOf,
  propose,
  runDecomposer,
  setup,
  twoSteps,
} from "./decomposerSetup";
import { call, waitForRun } from "./helpers";

const TTL = AGENT_LIMITS.claimTtlMs;

afterEach(() => {
  vi.useRealTimers();
});

describe("Decomposer on the seeded data", () => {
  it("proposes, asks, skips and finds the near-duplicate pair, saving suggestions with their aiState", async () => {
    setNow(T0);
    const { db, api } = setup({ seed: true });

    const run = await runDecomposer(api);
    expect(run).toMatchObject({
      agent: "decomposer",
      mode: "suggest",
      promptVersion: "DECOMPOSER_PROMPT_V1",
      input: {},
    });
    const output = outputOf(run);
    expect(outcomes(output)).toEqual({
      "Add an audit log for admin actions": "suggested_subtasks",
      "Publish OpenAPI docs for the public API": "suggested_subtasks",
      "Upgrade services to Node 22": "suggested_subtasks",
      "Remove stale feature flags": "suggested_subtasks",
      "Support dark mode in transactional emails": "suggested_subtasks",
      "Improve performance": "needs_clarification",
      "Fix the onboarding thing": "needs_clarification",
      "Reindex search after the schema change": "skipped",
      "Add rate limiting to the public API": "duplicate",
      "Rate-limit public API endpoints": "duplicate",
    });
    expect(output.changesetId).toBeNull();
    expect(output.counts).toEqual({
      considered: 10,
      suggestedSubtasks: 5,
      appliedSubtasks: 0,
      createdSubtasks: 0,
      appliedLinks: 0,
      needsClarification: 2,
      skipped: 1,
      duplicates: 2,
      claimed: 0,
      superseded: 0,
      failed: 0,
    });

    const byTitle = new Map(output.tasks.map((t) => [t.title, t]));
    const [group] = output.related;
    const rateLimit = byTitle.get("Add rate limiting to the public API")!;
    const again = byTitle.get("Rate-limit public API endpoints")!;
    expect(output.related).toEqual([
      {
        suggestionId: expect.any(Number),
        relation: "duplicates",
        taskIds: [rateLimit.taskId, again.taskId].sort((a, b) => a - b),
        applied: false,
      },
    ]);
    expect(rateLimit.suggestionId).toBe(group!.suggestionId);
    expect(findSuggestion(db, group!.suggestionId)).toMatchObject({
      kind: "related",
      status: "pending",
      targetId: Math.min(rateLimit.taskId, again.taskId),
      payload: { relation: "duplicates", taskIds: group!.taskIds },
    });

    const audit = byTitle.get("Add an audit log for admin actions")!;
    const detail = taskDetailSchema.parse((await api.get(`/api/tasks/${audit.taskId}`)).body);
    expect(detail.aiState).toBe("suggestion_pending");
    expect(detail.pendingSuggestions).toEqual([
      expect.objectContaining({ id: audit.suggestionId, kind: "subtasks", runId: run.id }),
    ]);
    expect(aiStateOf(db, byTitle.get("Improve performance")!.taskId)).toBe("clarification_pending");
    const reindex = byTitle.get("Reindex search after the schema change")!;
    expect(reindex).toMatchObject({ suggestionId: null });
    expect(aiStateOf(db, reindex.taskId)).toBe("none");
    expect(aiStateOf(db, rateLimit.taskId)).toBe("suggestion_pending");
    expect(listActiveClaims(db, Date.now())).toEqual([]);
  });
});

function batchIds(conversation: MockConversation): number[] {
  return [...conversation.userMessage.matchAll(/^(\d+) \| PD-\d+ \|/gm)].map((m) => Number(m[1]));
}

async function setStatus(api: Api, id: number, status: string) {
  await api.patch(`/api/tasks/${id}`).send({ status }).expect(200);
}

describe("Decomposer eligibility", () => {
  it("reports why each picked task was left out", async () => {
    setNow(T0);
    const { db, api } = setup({ task: twoSteps });
    const ok = addTask(db, { title: "Eligible" });
    const parent = addTask(db, { title: "Parent" });
    const child = addTask(db, { title: "Child", parentId: parent.id });
    const started = addTask(db, { title: "Started" });
    await setStatus(api, started.id, "in_progress");
    const pending = addTask(db, { title: "Pending" });
    const cooled = addTask(db, { title: "Cooled" });
    const claimed = addTask(db, { title: "Claimed" });
    const other = addRun(db);
    insertSuggestion(db, clarificationFor(other, pending.id, T0));
    const rejected = insertSuggestion(db, subtasksFor(other, cooled.id, T0 - 3 * DAY));
    resolveSuggestion(db, rejected.id, "rejected", T0 - 3 * DAY);
    tryClaim(db, claimed.id, other, "decomposer", T0);

    const taskIds = [ok, parent, child, started, pending, cooled, claimed].map((t) => t.id);
    const output = outputOf(await runDecomposer(api, { taskIds }));
    const detail = Object.fromEntries(output.tasks.map((t) => [t.title, [t.outcome, t.detail]]));
    expect(detail).toEqual({
      Eligible: ["suggested_subtasks", "Proposed 2 subtasks"],
      Parent: ["skipped", `Skipped ${parent.identifier}: it already has 1 subtask`],
      Child: [
        "skipped",
        `Skipped ${child.identifier}: it is a subtask; only top-level tasks are split`,
      ],
      Started: [
        "skipped",
        `Skipped ${started.identifier}: it is in_progress; only todo tasks are split`,
      ],
      Pending: [
        "skipped",
        `Skipped ${pending.identifier}: it has a pending suggestion to review first`,
      ],
      Cooled: [
        "skipped",
        `Skipped ${cooled.identifier}: a suggestion for it was rejected or rolled back in the last 7 days`,
      ],
      Claimed: [
        "claimed",
        `Skipped ${claimed.identifier}: being processed by decomposer run #${other}`,
      ],
    });
    expect(findActiveClaim(db, claimed.id, Date.now())?.runId).toBe(other);
  });

  it("puts high priority first, then the oldest, caps the batch at 10, keeps claimed tasks out and ignores an expired claim and an old rejection", async () => {
    const { db, api, relatedSeen } = setup({ related: [noGroups], task: twoSteps });
    const medium: { id: number }[] = [];
    for (let i = 0; i < 11; i++) {
      setNow(T0 + i * DAY);
      medium.push(addTask(db, { title: `Medium ${i}`, priority: "medium" }));
    }
    setNow(T0 + 20 * DAY);
    const high = addTask(db, { title: "High and new", priority: "high" });
    addTask(db, { title: "Low", priority: "low" });
    const other = addRun(db);
    tryClaim(db, medium[0]!.id, other, "decomposer", T0 + 20 * DAY - TTL);
    const old = insertSuggestion(db, subtasksFor(other, medium[1]!.id, T0));
    resolveSuggestion(db, old.id, "rejected", T0 + 12 * DAY);
    const busy = medium[2]!;
    tryClaim(db, busy.id, other, "decomposer", T0 + 20 * DAY);

    const output = outputOf(await runDecomposer(api));
    const picked = medium.filter((t) => t !== busy).slice(0, 9);
    expect(batchIds(relatedSeen[0]!)).toEqual([high.id, ...picked.map((t) => t.id)]);
    expect(output.counts).toMatchObject({ considered: 11, suggestedSubtasks: 10, claimed: 1 });
    expect(output.tasks.find((t) => t.taskId === busy.id)?.outcome).toBe("claimed");
  });

  it("completes with zero counts and a warning, without a model call, when nothing is eligible", async () => {
    const { db, api } = setup({ task: twoSteps });
    const done = addTask(db, { title: "Shipped" });
    await setStatus(api, done.id, "done");

    const run = await runDecomposer(api);
    expect(outputOf(run)).toEqual({
      tasks: [],
      related: [],
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
      },
      warnings: [{ message: "No eligible tasks" }],
    });
    expect(run.trace.filter((s) => s.type === "llm")).toEqual([]);
  });

  it("answers 400 for a task id that does not exist", async () => {
    const { api } = setup();
    const res = await api
      .post("/api/agents/decomposer/run")
      .send({ taskIds: [999] })
      .expect(400);
    expect(apiErrorBodySchema.parse(res.body).error.code).toBe("validation_error");
  });
});

describe("Decomposer stages", () => {
  it("asks about one task while the others still get proposals (spec 12)", async () => {
    let vague = 0;
    const { db, api } = setup({
      related: [noGroups],
      task: (id) => (id === vague ? ask : twoSteps()),
    });
    const a = addTask(db, { title: "Clear A" });
    vague = addTask(db, { title: "Vague" }).id;
    const b = addTask(db, { title: "Clear B" });

    const output = outputOf(await runDecomposer(api));
    expect(outcomes(output)).toEqual({
      "Clear A": "suggested_subtasks",
      Vague: "needs_clarification",
      "Clear B": "suggested_subtasks",
    });
    expect([aiStateOf(db, a.id), aiStateOf(db, vague), aiStateOf(db, b.id)]).toEqual([
      "suggestion_pending",
      "clarification_pending",
      "suggestion_pending",
    ]);
  });

  it("leaves a duplicates group out of stage 2 and still splits the rest", async () => {
    const seen: number[] = [];
    let group: number[] = [];
    const { db, api } = setup({
      related: [
        () =>
          call("report_related", {
            groups: [{ relation: "duplicates", taskIds: group, reason: "Same work." }],
          }),
      ],
      task: (id) => {
        seen.push(id);
        return twoSteps();
      },
    });
    const a = addTask(db, { title: "Rate limit the API" });
    const b = addTask(db, { title: "Rate-limit API endpoints" });
    const c = addTask(db, { title: "Something else" });
    group = [b.id, a.id];

    const output = outputOf(await runDecomposer(api));
    expect(seen).toEqual([c.id]);
    const [related] = output.related;
    expect(related).toEqual({
      suggestionId: expect.any(Number),
      relation: "duplicates",
      taskIds: [a.id, b.id],
      applied: false,
    });
    expect(findSuggestion(db, related!.suggestionId)).toMatchObject({
      kind: "related",
      status: "pending",
      targetId: a.id,
      payload: { relation: "duplicates", taskIds: [a.id, b.id], reason: "Same work." },
    });
    expect(output.tasks.filter((t) => t.outcome === "duplicate")).toEqual([
      {
        taskId: a.id,
        identifier: a.identifier,
        title: a.title,
        outcome: "duplicate",
        suggestionId: related!.suggestionId,
        detail: `Left out of this run: it duplicates ${b.identifier}. Same work.`,
      },
      expect.objectContaining({ taskId: b.id, outcome: "duplicate" }),
    ]);
    expect([aiStateOf(db, a.id), aiStateOf(db, b.id)]).toEqual([
      "suggestion_pending",
      "suggestion_pending",
    ]);
  });

  it("still splits a task whose duplicate is outside the batch, and drops invalid related ids and groups", async () => {
    const seen: number[] = [];
    let groups: unknown[] = [];
    const { db, api } = setup({
      related: [() => call("report_related", { groups })],
      task: (id) => {
        seen.push(id);
        return twoSteps();
      },
    });
    const a = addTask(db, { title: "Batch A" });
    const b = addTask(db, { title: "Batch B" });
    const outside = addTask(db, { title: "Outside, in progress" });
    await setStatus(api, outside.id, "in_progress");
    const done = addTask(db, { title: "Done" });
    await setStatus(api, done.id, "done");
    groups = [
      { relation: "duplicates", taskIds: [a.id, outside.id], reason: "Same as the open one." },
      { relation: "overlaps", taskIds: [outside.id, a.id], reason: "Repeat." },
      { relation: "overlaps", taskIds: [b.id, 999, done.id], reason: "Bad ids." },
    ];

    const output = outputOf(await runDecomposer(api, { taskIds: [a.id, b.id] }));
    expect([...seen].sort()).toEqual([a.id, b.id].sort());
    expect(output.related).toEqual([
      {
        suggestionId: expect.any(Number),
        relation: "duplicates",
        taskIds: [a.id, outside.id],
        applied: false,
      },
    ]);
    expect(output.warnings.map((w) => w.message)).toEqual([
      "Dropped a related group: it repeats a group.",
      "Left task 999 does not exist out of a related group.",
      `Left ${done.identifier} is done out of a related group.`,
      "Dropped a related group: fewer than 2 valid tasks were left.",
    ]);
    expect(aiStateOf(db, outside.id)).toBe("suggestion_pending");
  });

  it("drops a related group whose tasks are already linked, in either direction", async () => {
    let ids: number[] = [];
    const { db, api } = setup({
      related: [
        () =>
          call("report_related", {
            groups: [{ relation: "duplicates", taskIds: ids, reason: "Same work." }],
          }),
      ],
      task: twoSteps,
    });
    const a = addTask(db, { title: "A" });
    const b = addTask(db, { title: "B" });
    ids = [a.id, b.id];
    await api
      .post(`/api/tasks/${b.id}/links`)
      .send({ toTaskId: a.id, type: "duplicates" })
      .expect(201);

    const output = outputOf(await runDecomposer(api));
    expect(output.related).toEqual([]);
    expect(output.warnings.map((w) => w.message)).toContain(
      "Dropped a related group: its tasks are already linked.",
    );
    expect(listSuggestions(db, { status: "pending" }).filter((s) => s.kind === "related")).toEqual(
      [],
    );
  });

  it("does not save a related group that another run saved while this one worked", async () => {
    let group: number[] = [];
    const { db, api } = setup({
      related: [
        () => {
          insertSuggestion(db, relatedOf(addRun(db), group, Date.now()));
          return call("report_related", {
            groups: [{ relation: "overlaps", taskIds: [...group].reverse(), reason: "Shared." }],
          });
        },
      ],
      task: twoSteps,
    });
    const a = addTask(db, { title: "A" });
    const b = addTask(db, { title: "B" });
    group = [a.id, b.id];

    const output = outputOf(await runDecomposer(api));
    expect(output.related).toEqual([]);
    expect(output.warnings).toEqual([
      {
        message: expect.stringMatching(
          new RegExp(
            `^Related group ${a.identifier}, ${b.identifier} was not saved: it is already pending as suggestion #\\d+\\.$`,
          ),
        ),
      },
    ]);
    const related = listSuggestions(db, { targetId: a.id, status: "pending" }).filter(
      (s) => s.kind === "related",
    );
    expect(related).toHaveLength(1);
  });

  it("records a failed loop for one task while the others succeed", async () => {
    let broken = 0;
    const { db, api } = setup({
      related: [noGroups],
      task: (id) => (id === broken ? { text: "I am not sure." } : twoSteps()),
    });
    addTask(db, { title: "Works" });
    broken = addTask(db, { title: "Breaks" }).id;

    const output = outputOf(await runDecomposer(api));
    expect(outcomes(output)).toEqual({ Works: "suggested_subtasks", Breaks: "failed" });
    expect(output.tasks.find((t) => t.taskId === broken)?.detail).toMatch(
      /^The model replied twice without calling a tool/,
    );
    expect(output.counts.failed).toBe(1);
    expect(aiStateOf(db, broken)).toBe("none");
  });

  it("fails the run when every task it reached failed", async () => {
    const { db, api } = setup({ task: () => ({ text: "No." }) });
    addTask(db, { title: "Only" });

    const run = await runDecomposer(api);
    expect(run.status).toBe("failed");
    expect(run.error?.code).toBe("no_terminal_tool");
    expect(listActiveClaims(db, Date.now())).toEqual([]);
  });

  it("carries on without related tasks when the related pass fails", async () => {
    const { db, api } = setup({ related: [{ text: "?" }], task: twoSteps });
    addTask(db, { title: "A" });
    addTask(db, { title: "B" });

    const output = outputOf(await runDecomposer(api));
    expect(output.counts.suggestedSubtasks).toBe(2);
    expect(output.warnings).toEqual([
      { message: expect.stringMatching(/^The related-task pass failed: The model replied twice/) },
    ]);
  });
});

describe("Decomposer claims", () => {
  it("skips a task another run claims after stage 0, without a loop", async () => {
    const seen: number[] = [];
    let taken = 0;
    let other = 0;
    const { db, api } = setup({
      related: [
        () => {
          tryClaim(db, taken, other, "decomposer", Date.now());
          return noGroups;
        },
      ],
      task: (id) => {
        seen.push(id);
        return twoSteps();
      },
    });
    const free = addTask(db, { title: "Free" });
    const task = addTask(db, { title: "Taken" });
    taken = task.id;
    other = addRun(db);

    const output = outputOf(await runDecomposer(api));
    expect(seen).toEqual([free.id]);
    expect(output.tasks.find((t) => t.taskId === taken)).toMatchObject({
      outcome: "claimed",
      detail: `Skipped ${task.identifier}: being processed by decomposer run #${other}`,
    });
    expect(findActiveClaim(db, taken, Date.now())?.runId).toBe(other);
  });

  it("holds each task's claim during its loop and releases every claim, also when a loop throws", async () => {
    const holders: (number | undefined)[] = [];
    let broken = 0;
    const { db, api } = setup({
      related: [noGroups],
      task: (id) => {
        holders.push(findActiveClaim(db, id, Date.now())?.runId);
        expect(aiStateOf(db, id)).toBe("processing");
        return id === broken ? { text: "Hmm." } : twoSteps();
      },
    });
    const ok = addTask(db, { title: "Fine" });
    broken = addTask(db, { title: "Throws" }).id;

    const run = await runDecomposer(api);
    expect(holders.length).toBeGreaterThanOrEqual(2);
    expect(new Set(holders)).toEqual(new Set([run.id]));
    expect(listActiveClaims(db, Date.now())).toEqual([]);
    expect([aiStateOf(db, ok.id), aiStateOf(db, broken)]).toEqual(["suggestion_pending", "none"]);
  });

  it("releases a task's claim as soon as its own loop ends, while others still run", async () => {
    let quick = 0;
    let quickState: string | undefined;
    const { db, api } = setup({
      related: [noGroups],
      task: async (id, { turn }) => {
        if (id === quick) return twoSteps();
        if (turn === 1) return call("get_task", { id });
        for (let i = 0; i < 50 && findActiveClaim(db, quick, Date.now()); i++) {
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        quickState = aiStateOf(db, quick);
        return twoSteps();
      },
    });
    quick = addTask(db, { title: "Quick" }).id;
    addTask(db, { title: "Slow" });

    outputOf(await runDecomposer(api));
    expect(quickState).toBe("suggestion_pending");
  });

  it("renews the claim after every model call", async () => {
    let expiresAt: number | undefined;
    setNow(T0);
    const { db, api } = setup({
      task: (id, { turn }) => {
        if (turn === 1) {
          setNow(T0 + 90_000);
          return call("get_task", { id });
        }
        expiresAt = findActiveClaim(db, id, Date.now())?.expiresAt;
        return twoSteps();
      },
    });
    addTask(db, { title: "Long one" });

    outputOf(await runDecomposer(api));
    expect(expiresAt).toBe(T0 + 90_000 + TTL);
  });

  it("releases its claims when it is cancelled mid-run and saves nothing", async () => {
    const { db, api } = setup({ related: [noGroups], task: () => new Promise<MockTurn>(() => {}) });
    const a = addTask(db, { title: "A" });
    const b = addTask(db, { title: "B" });

    const res = await api.post("/api/agents/decomposer/run").send({}).expect(202);
    const runId = res.body.runId as number;
    for (let i = 0; i < 100 && listActiveClaims(db, Date.now()).length < 2; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(listActiveClaims(db, Date.now()).map((c) => c.runId)).toEqual([runId, runId]);

    await api.post(`/api/agents/runs/${runId}/cancel`).expect(200);
    const run = await waitForRun(api, runId);
    expect(run).toMatchObject({ status: "cancelled", error: { code: "cancelled" } });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(listActiveClaims(db, Date.now())).toEqual([]);
    expect([aiStateOf(db, a.id), aiStateOf(db, b.id)]).toEqual(["none", "none"]);
    expect(listSuggestions(db, {})).toEqual([]);
  });
});

describe("Decomposer output checks", () => {
  it("does not save a suggestion for a task the user edited during the run", async () => {
    setNow(T0);
    let task = { id: 0, identifier: "" };
    const { db, api } = setup({
      task: async () => {
        setNow(T0 + 1_000);
        await api.patch(`/api/tasks/${task.id}`).send({ title: "Edited meanwhile" }).expect(200);
        return twoSteps();
      },
    });
    task = addTask(db, { title: "Original" });

    const output = outputOf(await runDecomposer(api));
    expect(output.tasks).toEqual([
      expect.objectContaining({
        taskId: task.id,
        outcome: "superseded",
        suggestionId: null,
        detail: `${task.identifier} was edited while the Decomposer worked`,
      }),
    ]);
    expect(listSuggestions(db, { targetId: task.id })).toEqual([]);
    expect(aiStateOf(db, task.id)).toBe("none");
  });

  it("drops duplicate subtask titles and skips a task with fewer than 2 left", async () => {
    const titles = new Map<number, string[]>();
    const { db, api } = setup({
      related: [noGroups],
      task: (id) => propose(...titles.get(id)!),
    });
    const keeps = addTask(db, { title: "Keeps two" });
    const one = addTask(db, { title: "Keeps one" });
    const none = addTask(db, { title: "Keeps none" });
    titles.set(keeps.id, ["Keeps two", "Write the tests", " write  the TESTS ", "Ship it"]);
    titles.set(one.id, ["Only one", "only ONE"]);
    titles.set(none.id, ["keeps none", "KEEPS NONE"]);

    const output = outputOf(await runDecomposer(api));
    const byId = new Map(output.tasks.map((t) => [t.taskId, t]));
    expect(findSuggestion(db, byId.get(keeps.id)!.suggestionId!)?.payload).toEqual({
      subtasks: [
        { title: "Write the tests", description: "" },
        { title: "Ship it", description: "" },
      ],
      rationale: "Split it.",
    });
    expect(byId.get(one.id)).toMatchObject({
      outcome: "skipped",
      suggestionId: null,
      detail: "already_atomic: only one proposed subtask was not a duplicate",
    });
    expect(byId.get(none.id)).toMatchObject({
      outcome: "skipped",
      detail: "already_atomic: all proposed subtasks were duplicates",
    });
    expect([aiStateOf(db, one.id), aiStateOf(db, none.id)]).toEqual(["none", "none"]);
    expect(output.warnings).toEqual(
      expect.arrayContaining([
        {
          taskId: keeps.id,
          message: `${keeps.identifier}: dropped the subtask "Keeps two": it repeats the task's own title.`,
        },
        {
          taskId: keeps.id,
          message: `${keeps.identifier}: dropped the subtask "write  the TESTS": it duplicates another proposed subtask.`,
        },
      ]),
    );
    expect(output.warnings).toHaveLength(5);
  });

  it("saves a skip on the run only", async () => {
    const { db, api } = setup({
      task: () => call("skip", { reason: "not_actionable", explanation: "It is a note." }),
    });
    const task = addTask(db, { title: "A note" });

    const output = outputOf(await runDecomposer(api));
    expect(output.tasks).toEqual([
      expect.objectContaining({
        outcome: "skipped",
        suggestionId: null,
        detail: "not_actionable: It is a note.",
      }),
    ]);
    expect(listSuggestions(db, { targetId: task.id })).toEqual([]);
  });
});

describe("Decomposer clarify", () => {
  function pendingClarification(db: ReturnType<typeof createTestDb>, title: string) {
    const task = addTask(db, { title });
    const suggestion = insertSuggestion(db, clarificationFor(addRun(db), task.id, Date.now()));
    return { task, suggestion };
  }

  it("turns the answers into a proposal and supersedes the old clarification", async () => {
    const { db, api } = setup();
    const { task, suggestion } = pendingClarification(db, "Improve performance");
    const body = {
      suggestionId: suggestion.id,
      answers: [
        { question: "Which users does this cover?", answer: "cut the projects page load to 1 s" },
      ],
    };

    const run = await clarify(api, body);
    expect(run).toMatchObject({ agent: "decomposer", mode: "suggest", input: body });
    const [result] = outputOf(run).tasks;
    expect(result).toMatchObject({ taskId: task.id, outcome: "suggested_subtasks" });
    expect(findSuggestion(db, result!.suggestionId!)).toMatchObject({
      kind: "subtasks",
      status: "pending",
      payload: {
        subtasks: [
          { title: "Plan: Improve performance" },
          { title: "Cut the projects page load to 1 s" },
          { title: "Test and roll out: Improve performance" },
        ],
      },
    });
    expect(findSuggestion(db, suggestion.id)?.status).toBe("superseded");
    expect(aiStateOf(db, task.id)).toBe("suggestion_pending");
  });

  it("adds the questions and answers to the first message", async () => {
    const seen: MockConversation[] = [];
    const { db, api } = setup({
      task: (_id, conversation) => {
        seen.push(conversation);
        return twoSteps();
      },
    });
    const { suggestion } = pendingClarification(db, "Vague");
    await clarify(api, {
      suggestionId: suggestion.id,
      answers: [{ question: "Which users does this cover?", answer: "Admins <b>only</b>" }],
    });
    expect(seen[0]!.userMessage).toContain(
      "Q: Which users does this cover?\nA: <answer>Admins &lt;b&gt;only&lt;/b&gt;</answer>",
    );
    expect(seen[0]!.userMessage).toContain("What was unclear: <task>The scope</task>");
  });

  it("keeps the clarification pending when the rerun fails", async () => {
    const { db, api } = setup({ task: () => ({ text: "Still unsure." }) });
    const { task, suggestion } = pendingClarification(db, "Vague");

    const run = await clarify(api, {
      suggestionId: suggestion.id,
      answers: [{ question: "Which users does this cover?", answer: "All of them" }],
    });
    expect(run.status).toBe("failed");
    expect(run.error?.code).toBe("no_terminal_tool");
    expect(findSuggestion(db, suggestion.id)?.status).toBe("pending");
    expect(aiStateOf(db, task.id)).toBe("clarification_pending");
    expect(listActiveClaims(db, Date.now())).toEqual([]);
  });

  it("never offers ask_clarification on Generate anyway", async () => {
    const seen: MockConversation[] = [];
    const { db, api } = setup({
      task: (_id, conversation) => {
        seen.push(conversation);
        return conversation.turn === 1 ? ask : twoSteps();
      },
    });
    const { suggestion } = pendingClarification(db, "Vague");

    const run = await clarify(api, { suggestionId: suggestion.id, generateAnyway: true });
    expect(outputOf(run).tasks[0]!.outcome).toBe("suggested_subtasks");
    expect(seen[0]!.userMessage).toContain('The user chose "Generate anyway"');
    expect(seen[1]!.lastResults).toEqual([
      expect.objectContaining({
        toolName: "ask_clarification",
        isError: true,
        output: expect.stringContaining('Unknown tool "ask_clarification"'),
      }),
    ]);
    expect(findSuggestion(db, suggestion.id)?.status).toBe("superseded");
  });

  it("generates with assumptions on the default mock", async () => {
    const { db, api } = setup();
    const { task, suggestion } = pendingClarification(db, "Improve performance");

    const run = await clarify(api, { suggestionId: suggestion.id, generateAnyway: true });
    const [result] = outputOf(run).tasks;
    expect(result!.outcome).toBe("suggested_subtasks");
    expect(findSuggestion(db, result!.suggestionId!)?.payload).toMatchObject({
      rationale: expect.stringContaining("Assumptions:"),
    });
    expect(aiStateOf(db, task.id)).toBe("suggestion_pending");
  });

  it("answers 404, 400 and 409 for a missing, wrong-kind or resolved suggestion", async () => {
    const { db, api } = setup();
    const task = addTask(db, { title: "T" });
    const subtasks = insertSuggestion(db, subtasksFor(addRun(db), task.id, Date.now()));
    const { suggestion: rejected } = pendingClarification(db, "Rejected");
    resolveSuggestion(db, rejected.id, "rejected", Date.now());
    const answers = [{ question: "Q?", answer: "A" }];
    const code = async (body: object, status: number) => {
      const res = await api.post("/api/agents/decomposer/clarify").send(body).expect(status);
      return apiErrorBodySchema.parse(res.body).error.code;
    };

    expect(await code({ suggestionId: 999, answers }, 404)).toBe("not_found");
    expect(await code({ suggestionId: subtasks.id, answers }, 400)).toBe("validation_error");
    expect(await code({ suggestionId: rejected.id, answers }, 409)).toBe("conflict");
    expect(await code({ suggestionId: rejected.id }, 400)).toBe("validation_error");
    expect(findTask(db, task.id)?.aiState).toBe("suggestion_pending");
  });
});

describe("Decomposer routes with AI off", () => {
  it("answers 403 ai_disabled on run and clarify", async () => {
    const { api } = setup();
    await api.patch("/api/settings").send({ aiEnabled: false }).expect(200);
    for (const [path, body] of [
      ["run", {}],
      ["clarify", { suggestionId: 1, generateAnyway: true }],
    ] as const) {
      const res = await api.post(`/api/agents/decomposer/${path}`).send(body).expect(403);
      expect(apiErrorBodySchema.parse(res.body).error.code).toBe("ai_disabled");
    }
  });
});
