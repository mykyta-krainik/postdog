import {
  completedPlannerRunSchema,
  type AgentRun,
  type AgentRunError,
  type AgentRunSummary,
  type AgentsInfo,
  type ListAgentRunsQuery,
  type PlannerLatestResponse,
  type RunTrigger,
  type StartRunResponse,
} from "@postdog/shared";
import type { AgentContext, AgentDefinition } from "../agents/core/definition";
import { AgentError } from "../agents/core/errors";
import type { Llm } from "../agents/core/llm";
import { createTraceRecorder } from "../agents/core/trace";
import type { Tracer } from "../agents/core/tracer";
import type { AgentRegistry } from "../agents/registry";
import type { Db } from "../db/client";
import { conflict, notFound } from "../lib/errors";
import { logger } from "../lib/logger";
import {
  failRunningRuns,
  findLatestRun,
  findRun,
  finishRun,
  insertRun,
  listRunningRunIds,
  listRuns,
  updateRun,
  type RunFinish,
} from "../repositories/agentRuns";
import { recomputeAllAiStates } from "../repositories/aiState";
import { deleteClaimsOfStoppedRuns, releaseClaims } from "../repositories/claims";
import { insertNotification } from "../repositories/notifications";
import { countTasksUpdatedAfter } from "../repositories/tasks";
import { runEndNotification } from "./runNotifications";
import { runLabel } from "./runLabel";

const INTERRUPTED: AgentRunError = {
  code: "interrupted",
  message: "The API stopped while this run was in progress.",
};

/**
 * A run counts as watched while a client's start of it or its last GET /api/agents/runs/:id is at
 * most this old. The web polls every 1.5 s, and a throttled background tab about once a minute.
 */
export const WATCH_WINDOW_MS = 8_000;

/**
 * Fails runs a crash left running with one Inbox entry each, drops their claims and rebuilds
 * every task's aiState. A second call finds no running run, so it notifies nobody again.
 */
export function reconcileInterruptedRuns(db: Db, now = Date.now()): number {
  return db.transaction((tx) => {
    const interrupted = failRunningRuns(tx, { error: INTERRUPTED, finishedAt: now });
    for (const run of interrupted) {
      const notification = runEndNotification(run, false, now);
      if (notification) insertNotification(tx, notification);
    }
    deleteClaimsOfStoppedRuns(tx, now);
    recomputeAllAiStates(tx, now);
    return interrupted.length;
  });
}

function toRunError(err: unknown, signal: AbortSignal): AgentRunError {
  if (err instanceof AgentError) return err.toRunError();
  if (signal.aborted && signal.reason instanceof AgentError) return signal.reason.toRunError();
  const message = err instanceof Error ? err.message : String(err);
  return { code: "internal_error", message: `The agent crashed: ${message}` };
}

function statusOf(error: AgentRunError): RunFinish["status"] {
  return error.code === "cancelled" || error.code === "ai_disabled" ? "cancelled" : "failed";
}

export type AgentKey = keyof AgentRegistry;
type InputOf<K extends AgentKey> =
  AgentRegistry[K] extends AgentDefinition<infer I, unknown> ? I : never;

/**
 * Runs that share a slot cannot run at once, so a double click or a second tab gets 409
 * instead of a second run racing the first. `busy` opens the 409 message.
 */
type RunSlot<I> = (input: I) => { slot: string; busy: string };

const RUN_SLOTS: { [K in AgentKey]: RunSlot<InputOf<K>> } = {
  planner: () => ({ slot: "planner", busy: "A Planner run is already in progress" }),
  decomposer: () => ({ slot: "decomposer", busy: "A Decomposer run is already in progress" }),
  decomposer_clarify: ({ suggestionId }) => ({
    slot: `decomposer_clarify:${suggestionId}`,
    busy: "A Decomposer run is already answering this clarification",
  }),
  status_updater: (input) => ({
    slot: input.scope === "task" ? `status_updater:task:${input.taskId}` : "status_updater:since",
    busy: "A Status updater run for the same scope is already in progress",
  }),
};

export function createAgentRunService(deps: {
  db: Db;
  llm: Llm;
  tracer: Tracer;
  agents: AgentRegistry;
  now?: () => number;
}) {
  const { db, llm, tracer, agents, now = () => Date.now() } = deps;
  /**
   * The runs this process executes: how to stop each, its execute until it has saved, and when a
   * client last showed it is there, by starting the run or reading it (null until a client reads a
   * scheduled run). The entry goes once the run has saved its end.
   */
  const active = new Map<
    number,
    { controller: AbortController; done: Promise<void>; lastSeenAt: number | null }
  >();
  /** The run holding each slot of RUN_SLOTS. */
  const slots = new Map<string, number>();

  function freeSlot(runId: number): void {
    for (const [slot, holder] of slots) if (holder === runId) slots.delete(slot);
  }

  function requireRun(id: number) {
    const run = findRun(db, id);
    if (!run) throw notFound(`Agent run ${id} not found`);
    return run;
  }

  function watched(id: number, at: number): boolean {
    const seenAt = active.get(id)?.lastSeenAt;
    return seenAt != null && at - seenAt <= WATCH_WINDOW_MS;
  }

  /** Saves the run's end and its Inbox entry in one transaction, unless the run already ended. */
  function saveEnd(id: number, finish: RunFinish): void {
    const seen = watched(id, finish.finishedAt);
    db.transaction((tx) => {
      const run = finishRun(tx, id, finish);
      const notification = run && runEndNotification(run, seen, finish.finishedAt);
      if (notification) insertNotification(tx, notification);
    });
  }

  function stop(id: number, reason: AgentError): void {
    active.get(id)?.controller.abort(reason);
    const at = now();
    const error = reason.toRunError();
    saveEnd(id, { status: statusOf(error), error, finishedAt: at });
    releaseClaims(db, id, at);
    freeSlot(id);
  }

  async function execute<I, O>(definition: AgentDefinition<I, O>, ctx: AgentContext, input: I) {
    let finish: RunFinish;
    let traced: { output?: unknown; error?: string };
    try {
      const { output } = await definition.run(ctx, input);
      const parsed = definition.output.parse(output);
      finish = { status: "completed", output: parsed, error: null, finishedAt: now() };
      traced = { output: parsed };
    } catch (err) {
      const error = toRunError(err, ctx.signal);
      if (error.code === "internal_error") {
        logger.error(`Agent run ${ctx.runId} (${definition.name}) crashed`, { err });
      }
      finish = { status: statusOf(error), output: null, error, finishedAt: now() };
      traced = { error: `${error.code}: ${error.message}` };
    }
    saveEnd(ctx.runId, { ...finish, trace: ctx.trace.steps(), usage: ctx.trace.usage() });
    releaseClaims(db, ctx.runId, now());
    freeSlot(ctx.runId);
    ctx.tracer.end(traced);
    await tracer.flush().catch((err: unknown) => logger.error("Langfuse flush failed", { err }));
  }

  return {
    /**
     * Starts the agent registered under `key`, or answers 409 while its slot is taken. A scheduled
     * run has no client that started it, so it starts unwatched.
     */
    start<K extends AgentKey>(
      key: K,
      body: InputOf<K>,
      trigger: RunTrigger = "manual",
    ): StartRunResponse {
      const { slot, busy } = (RUN_SLOTS[key] as RunSlot<InputOf<K>>)(body);
      const holder = slots.get(slot);
      if (holder !== undefined) throw conflict(`${busy} (run #${holder}).`);

      const definition = agents[key] as AgentDefinition<InputOf<K>, unknown>;
      const startedAt = now();
      const input = definition.prepare ? definition.prepare(db, body, startedAt) : body;
      const mode = definition.mode?.(db) ?? null;
      const run = insertRun(db, {
        agent: definition.name,
        mode,
        status: "running",
        trigger,
        promptVersion: definition.promptVersion,
        input,
        trace: [],
        llm: llm.info,
        startedAt,
      });
      const controller = new AbortController();
      const runTracer = tracer.startRun({
        runId: run.id,
        agent: definition.name,
        promptVersion: definition.promptVersion,
        mode: llm.info.mode,
        input,
      });
      if (runTracer.traceId) updateRun(db, run.id, { langfuseTraceId: runTracer.traceId });
      const ctx: AgentContext = {
        runId: run.id,
        startedAt,
        mode,
        db,
        llm,
        signal: controller.signal,
        tracer: runTracer,
        trace: createTraceRecorder((trace, usage) => updateRun(db, run.id, { trace, usage })),
      };
      const done = execute(definition, ctx, input)
        .catch((err: unknown) => logger.error(`Agent run ${run.id} could not be saved`, { err }))
        .finally(() => active.delete(run.id));
      active.set(run.id, {
        controller,
        done,
        lastSeenAt: trigger === "manual" ? startedAt : null,
      });
      slots.set(slot, run.id);
      return { runId: run.id };
    },

    /** Reading a run this process executes marks it as watched (see WATCH_WINDOW_MS). */
    get(id: number): AgentRun {
      const run = requireRun(id);
      const live = active.get(id);
      if (live) live.lastSeenAt = now();
      return run;
    },

    list(query: ListAgentRunsQuery): AgentRunSummary[] {
      return listRuns(db, query).map(({ input, ...run }) => ({
        ...run,
        label: runLabel(db, run.agent, input),
      }));
    },

    cancel(id: number): AgentRun {
      const run = requireRun(id);
      if (run.status !== "running") {
        throw conflict(`Agent run ${id} is not running; its status is ${run.status}`);
      }
      stop(id, new AgentError("cancelled", "Cancelled by the user."));
      return requireRun(id);
    },

    cancelAll(reason: AgentError): void {
      for (const id of listRunningRunIds(db)) stop(id, reason);
    },

    /**
     * Fails the runs this process is executing, as the next start would, and resolves once each
     * has saved its end. Runs of another process on the same database are left alone.
     */
    async interruptActive(): Promise<void> {
      const reason = new AgentError(INTERRUPTED.code, INTERRUPTED.message);
      const running = [...active];
      for (const [id] of running) stop(id, reason);
      await Promise.allSettled(running.map(([, run]) => run.done));
    },

    info(): AgentsInfo {
      return { llm: llm.info };
    },

    plannerLatest(): PlannerLatestResponse {
      const run = findLatestRun(db, "planner", "completed");
      if (!run) return { latest: null };
      const completed = completedPlannerRunSchema.parse(run);
      return {
        latest: { run: completed, changedSince: countTasksUpdatedAfter(db, completed.finishedAt) },
      };
    },
  };
}

export type AgentRunService = ReturnType<typeof createAgentRunService>;
