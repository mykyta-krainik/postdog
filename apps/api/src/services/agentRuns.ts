import {
  completedPlannerRunSchema,
  type AgentRun,
  type AgentRunError,
  type AgentRunSummary,
  type AgentsInfo,
  type ListAgentRunsQuery,
  type PlannerLatestResponse,
  type StartRunResponse,
} from "@postdog/shared";
import type { AgentContext, AgentDefinition } from "../agents/core/definition";
import { AgentError } from "../agents/core/errors";
import type { Llm } from "../agents/core/llm";
import { createTraceRecorder } from "../agents/core/trace";
import type { Tracer } from "../agents/core/tracer";
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
import { countTasksUpdatedAfter } from "../repositories/tasks";

const INTERRUPTED: AgentRunError = {
  code: "interrupted",
  message: "The API stopped while this run was in progress.",
};

export function reconcileInterruptedRuns(db: Db, now = Date.now()): number {
  return failRunningRuns(db, { error: INTERRUPTED, finishedAt: now });
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

export function createAgentRunService(deps: { db: Db; llm: Llm; tracer: Tracer }) {
  const { db, llm, tracer } = deps;
  const active = new Map<number, AbortController>();

  function requireRun(id: number) {
    const run = findRun(db, id);
    if (!run) throw notFound(`Agent run ${id} not found`);
    return run;
  }

  function stop(id: number, reason: AgentError): void {
    active.get(id)?.abort(reason);
    finishRun(db, id, { status: "cancelled", error: reason.toRunError(), finishedAt: Date.now() });
  }

  async function execute<I, O>(definition: AgentDefinition<I, O>, ctx: AgentContext, input: I) {
    let finish: RunFinish;
    let traced: { output?: unknown; error?: string };
    try {
      const { output } = await definition.run(ctx, input);
      const parsed = definition.output.parse(output);
      finish = { status: "completed", output: parsed, error: null, finishedAt: Date.now() };
      traced = { output: parsed };
    } catch (err) {
      const error = toRunError(err, ctx.signal);
      if (error.code === "internal_error") {
        logger.error(`Agent run ${ctx.runId} (${definition.name}) crashed`, { err });
      }
      finish = { status: statusOf(error), output: null, error, finishedAt: Date.now() };
      traced = { error: `${error.code}: ${error.message}` };
    }
    finishRun(db, ctx.runId, { ...finish, trace: ctx.trace.steps(), usage: ctx.trace.usage() });
    ctx.tracer.end(traced);
    await tracer.flush().catch((err: unknown) => logger.error("Langfuse flush failed", { err }));
  }

  return {
    start<I, O>(definition: AgentDefinition<I, O>, body: I): StartRunResponse {
      const startedAt = Date.now();
      const input = definition.prepare ? definition.prepare(db, body, startedAt) : body;
      const run = insertRun(db, {
        agent: definition.name,
        mode: null,
        status: "running",
        promptVersion: definition.promptVersion,
        input,
        trace: [],
        llm: llm.info,
        startedAt,
      });
      const controller = new AbortController();
      active.set(run.id, controller);
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
        db,
        llm,
        signal: controller.signal,
        tracer: runTracer,
        trace: createTraceRecorder((trace, usage) => updateRun(db, run.id, { trace, usage })),
      };
      void execute(definition, ctx, input)
        .catch((err: unknown) => logger.error(`Agent run ${run.id} could not be saved`, { err }))
        .finally(() => active.delete(run.id));
      return { runId: run.id };
    },

    get(id: number): AgentRun {
      return requireRun(id);
    },

    list(query: ListAgentRunsQuery): AgentRunSummary[] {
      return listRuns(db, query);
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
