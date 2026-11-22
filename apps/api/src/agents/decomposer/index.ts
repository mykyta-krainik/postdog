import {
  AGENT_LIMITS,
  clarifyInputSchema,
  decomposerOutputSchema,
  decomposerRunInputSchema,
  type AgentWarning,
  type ClarifyInput,
  type DecomposerOutcome,
  type DecomposerOutput,
  type DecomposerRelatedResult,
  type DecomposerRunInput,
  type DecomposerTaskResult,
  type RelatedPayload,
} from "@postdog/shared";
import type { Db } from "../../db/client";
import type { TaskRow } from "../../db/schema";
import { conflict, invalidField, notFound } from "../../lib/errors";
import { logger } from "../../lib/logger";
import { releaseTaskClaim, renewClaims, tryClaim } from "../../repositories/claims";
import { findSuggestion, resolveSuggestion } from "../../repositories/suggestions";
import { findTask } from "../../repositories/tasks";
import { defineAgent, type AgentContext } from "../core/definition";
import { AgentError } from "../core/errors";
import { registerMockScript } from "../core/llm";
import { runAgent } from "../core/runAgent";
import type { TraceRecorder } from "../core/trace";
import { applierFor, appliedMode, requestedMode, type Applier, type ApplyRun } from "./apply";
import { claimedResult, selectBatch, taskResult } from "./eligibility";
import { relatedMockScript, taskMockScript } from "./mock";
import {
  DECOMPOSER_PROMPT_V1,
  DECOMPOSER_PROMPT_VERSION,
  relatedUserMessage,
  taskUserMessage,
  type ClarifyContext,
  type RelatedNote,
} from "./prompt";
import {
  askClarification,
  decomposerReadTools,
  proposeSubtasks,
  reportRelated,
  skip,
} from "./tools";
import { checkProposal, checkRelatedGroups, type Decision, type Dropped } from "./validate";

export const DECOMPOSER_LOOPS = { related: "decomposer:related", task: "decomposer:task" };
export type DecomposerLoops = typeof DECOMPOSER_LOOPS;

registerMockScript(DECOMPOSER_LOOPS.related, relatedMockScript);
registerMockScript(DECOMPOSER_LOOPS.task, taskMockScript);

interface TaskJob {
  task: TaskRow;
  related: RelatedNote[];
  clarify?: ClarifyContext;
  supersedes?: number;
}

interface TaskDone {
  result: DecomposerTaskResult;
  warnings: AgentWarning[];
}

const SETTLED_OUTCOMES = new Set<DecomposerOutcome>([
  "suggested_subtasks",
  "needs_clarification",
  "skipped",
]);

function stopped(signal: AbortSignal): AgentError {
  return signal.reason instanceof AgentError
    ? signal.reason
    : new AgentError("cancelled", "The run was cancelled.");
}

function traceFor(trace: TraceRecorder, identifier: string): TraceRecorder {
  return {
    ...trace,
    record: (entry) =>
      trace.record({ ...entry, outputSummary: `${identifier}: ${entry.outputSummary}` }),
  };
}

function recordDropped(trace: TraceRecorder, tool: string, dropped: readonly Dropped[]): void {
  for (const { item, warning } of dropped) {
    trace.record({
      type: "validation",
      tool,
      input: item,
      outputSummary: warning.message,
      durationMs: 0,
    });
  }
}

function applyRun(ctx: AgentContext): ApplyRun {
  return { runId: ctx.runId, startedAt: ctx.startedAt, now: Date.now() };
}

function noteMode(ctx: AgentContext): void {
  const requested = requestedMode(ctx.db);
  if (requested === ctx.mode) return;
  ctx.trace.record({
    type: "validation",
    input: { requested, applied: ctx.mode },
    outputSummary: "Auto mode arrives in phase 4, saved as a suggestion",
    durationMs: 0,
  });
}

async function settleEach<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      [results[i]] = await Promise.allSettled([work(items[i]!)]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function failedResult(task: TaskRow, err: unknown): DecomposerTaskResult {
  if (err instanceof AgentError) return taskResult(task, "failed", err.message);
  logger.error(`The Decomposer crashed on ${task.identifier}`, { err });
  const message = err instanceof Error ? err.message : String(err);
  return taskResult(task, "failed", `The agent crashed: ${message}`);
}

function buildOutput(
  tasks: DecomposerTaskResult[],
  related: DecomposerRelatedResult[],
  warnings: AgentWarning[],
): DecomposerOutput {
  const count = (outcome: DecomposerOutcome) => tasks.filter((t) => t.outcome === outcome).length;
  return {
    tasks,
    related,
    counts: {
      considered: tasks.length,
      suggestedSubtasks: count("suggested_subtasks"),
      needsClarification: count("needs_clarification"),
      skipped: count("skipped"),
      duplicates: count("duplicate"),
      claimed: count("claimed"),
      superseded: count("superseded"),
      failed: count("failed"),
    },
    warnings,
  };
}

async function relatedPass(ctx: AgentContext, loop: string, batch: TaskRow[]) {
  const { output } = await runAgent({
    ...ctx,
    name: loop,
    system: DECOMPOSER_PROMPT_V1.related,
    userMessage: relatedUserMessage(batch),
    tools: [...decomposerReadTools(ctx.db), reportRelated],
  });
  const checked = checkRelatedGroups(ctx.db, output.groups, batch);
  recordDropped(ctx.trace, reportRelated.name, checked.dropped);
  ctx.trace.record({
    type: "validation",
    tool: reportRelated.name,
    input: output.groups,
    outputSummary: `Checked the related groups: kept ${checked.groups.length} of ${output.groups.length}`,
    durationMs: 0,
  });
  return { groups: checked.groups, warnings: checked.dropped.map((d) => d.warning) };
}

function decide(
  ctx: AgentContext,
  task: TaskRow,
  result: Awaited<ReturnType<typeof runTaskLoop>>,
): { decision: Decision; dropped: Dropped[] } {
  switch (result.toolName) {
    case "propose_subtasks":
      return checkProposal(ctx.db, task, result.output);
    case "ask_clarification":
      return { decision: { kind: "clarification", payload: result.output }, dropped: [] };
    case "skip": {
      const detail = `${result.output.reason}: ${result.output.explanation}`;
      return { decision: { kind: "skip", detail }, dropped: [] };
    }
  }
}

function runTaskLoop(ctx: AgentContext, loop: string, job: TaskJob, trace: TraceRecorder) {
  const terminal = job.clarify?.generateAnyway
    ? [proposeSubtasks, skip]
    : [proposeSubtasks, askClarification, skip];
  return runAgent({
    ...ctx,
    trace,
    name: loop,
    system: DECOMPOSER_PROMPT_V1.task,
    userMessage: taskUserMessage(job.task, job.related, job.clarify),
    tools: [...decomposerReadTools(ctx.db), ...terminal],
    onStep: () => renewClaims(ctx.db, ctx.runId, Date.now()),
  });
}

/**
 * Stage 2 and 3 for one task: claim it, run its loop, check the output and apply it.
 * When it re-runs a clarification, the old one is superseded only together with a
 * settled result; a failed loop leaves it pending.
 */
async function decomposeTask(
  ctx: AgentContext,
  loop: string,
  applier: Applier,
  job: TaskJob,
): Promise<TaskDone> {
  const { task } = job;
  if (ctx.signal.aborted) throw stopped(ctx.signal);
  const claim = tryClaim(ctx.db, task.id, ctx.runId, "decomposer", Date.now());
  if (!claim.claimed) {
    const result = claimedResult(task, claim.heldBy);
    ctx.trace.record({
      type: "validation",
      input: task.id,
      outputSummary: result.detail,
      durationMs: 0,
    });
    return { result, warnings: [] };
  }
  try {
    const trace = traceFor(ctx.trace, task.identifier);
    const loopResult = await runTaskLoop(ctx, loop, job, trace);
    const { decision, dropped } = decide(ctx, task, loopResult);
    recordDropped(trace, loopResult.toolName, dropped);
    if (ctx.signal.aborted) throw stopped(ctx.signal);
    const run = applyRun(ctx);
    const result = ctx.db.transaction((tx) => {
      const applied = applier.task(tx, run, task, decision);
      if (job.supersedes !== undefined && SETTLED_OUTCOMES.has(applied.outcome)) {
        resolveSuggestion(tx, job.supersedes, "superseded", run.now);
      }
      return applied;
    });
    trace.record({
      type: "validation",
      input: decision,
      outputSummary: result.detail,
      durationMs: 0,
    });
    return { result, warnings: dropped.map((d) => d.warning) };
  } finally {
    releaseTaskClaim(ctx.db, task.id, ctx.runId, Date.now());
  }
}

function relatedNotes(db: Db, task: TaskRow, groups: readonly RelatedPayload[]): RelatedNote[] {
  return groups
    .filter((group) => group.taskIds.includes(task.id))
    .flatMap((group) =>
      group.taskIds
        .filter((id) => id !== task.id)
        .map((id) => findTask(db, id))
        .filter((other) => other !== undefined)
        .map((other) => ({ task: other, relation: group.relation, reason: group.reason })),
    );
}

/** The run fails only when every task it reached failed and it saved nothing. */
function failIfNothingWorked(
  settled: readonly PromiseSettledResult<TaskDone>[],
  output: DecomposerOutput,
): void {
  const firstFailure = settled.find((s) => s.status === "rejected");
  const allFailed = output.tasks.every((t) => t.outcome === "failed");
  if (firstFailure && allFailed && output.related.length === 0) throw firstFailure.reason;
}

async function runBatch(
  ctx: AgentContext,
  loops: DecomposerLoops,
  input: DecomposerRunInput,
): Promise<{ output: DecomposerOutput }> {
  const applier = applierFor(ctx.mode);
  noteMode(ctx);
  const batch = selectBatch(ctx.db, input.taskIds, ctx.startedAt);
  const picked = batch.tasks.map((t) => t.identifier).join(", ");
  ctx.trace.record({
    type: "validation",
    input: input.taskIds ?? "every eligible task",
    outputSummary:
      batch.tasks.length === 0
        ? `No eligible tasks; left out ${batch.excluded.length}`
        : `Picked ${batch.tasks.length} eligible tasks: ${picked}; left out ${batch.excluded.length}`,
    durationMs: 0,
  });
  if (batch.tasks.length === 0) {
    return { output: buildOutput(batch.excluded, [], [{ message: "No eligible tasks" }]) };
  }

  const warnings: AgentWarning[] = [];
  let groups: RelatedPayload[] = [];
  if (batch.tasks.length > 1) {
    try {
      const pass = await relatedPass(ctx, loops.related, batch.tasks);
      groups = pass.groups;
      warnings.push(...pass.warnings);
    } catch (err) {
      if (ctx.signal.aborted) throw stopped(ctx.signal);
      const message = err instanceof Error ? err.message : String(err);
      warnings.push({ message: `The related-task pass failed: ${message}`.slice(0, 300) });
    }
  }

  const related: DecomposerRelatedResult[] = [];
  const suggestionOf = new Map<RelatedPayload, number>();
  for (const group of groups) {
    const applied = ctx.db.transaction((tx) => applier.related(tx, applyRun(ctx), group));
    if (!applied.saved) {
      warnings.push(applied.warning);
      continue;
    }
    suggestionOf.set(group, applied.suggestionId);
    related.push({
      suggestionId: applied.suggestionId,
      relation: group.relation,
      taskIds: group.taskIds,
    });
  }

  const batchIds = new Set(batch.tasks.map((t) => t.id));
  const duplicateGroup = new Map<number, RelatedPayload>();
  for (const group of groups) {
    const inBatch = group.taskIds.filter((id) => batchIds.has(id));
    if (group.relation !== "duplicates" || inBatch.length < 2) continue;
    for (const id of inBatch) duplicateGroup.set(id, group);
  }
  const duplicates = batch.tasks.flatMap((task) => {
    const group = duplicateGroup.get(task.id);
    if (!group) return [];
    const others = relatedNotes(ctx.db, task, [group])
      .map((n) => n.task.identifier)
      .join(", ");
    const detail = `Left out of this run: it duplicates ${others}. ${group.reason}`;
    return [taskResult(task, "duplicate", detail, suggestionOf.get(group) ?? null)];
  });

  const jobs = batch.tasks
    .filter((task) => !duplicateGroup.has(task.id))
    .map((task): TaskJob => ({ task, related: relatedNotes(ctx.db, task, groups) }));
  const settled = await settleEach(jobs, AGENT_LIMITS.decomposerConcurrency, (job) =>
    decomposeTask(ctx, loops.task, applier, job),
  );
  if (ctx.signal.aborted) throw stopped(ctx.signal);

  const done = settled.map((s, i): TaskDone =>
    s.status === "fulfilled"
      ? s.value
      : { result: failedResult(jobs[i]!.task, s.reason), warnings: [] },
  );
  const output = buildOutput(
    [...done.map((d) => d.result), ...duplicates, ...batch.excluded],
    related,
    [...warnings, ...done.flatMap((d) => d.warnings)],
  );
  failIfNothingWorked(settled, output);
  return { output };
}

async function runClarify(
  ctx: AgentContext,
  loops: Pick<DecomposerLoops, "task">,
  input: ClarifyInput,
): Promise<{ output: DecomposerOutput }> {
  const applier = applierFor(ctx.mode);
  noteMode(ctx);
  const suggestion = findSuggestion(ctx.db, input.suggestionId);
  if (suggestion?.kind !== "clarification" || suggestion.status !== "pending") {
    throw new AgentError(
      "nothing_valid",
      `Suggestion #${input.suggestionId} is no longer a pending clarification.`,
    );
  }
  const task = findTask(ctx.db, suggestion.targetId);
  if (!task) throw new AgentError("nothing_valid", `Task ${suggestion.targetId} no longer exists.`);

  const job: TaskJob = {
    task,
    related: [],
    clarify: {
      previous: suggestion.payload,
      answers: input.answers,
      generateAnyway: input.generateAnyway,
    },
    supersedes: suggestion.id,
  };
  const settled = await settleEach([job], 1, (j) => decomposeTask(ctx, loops.task, applier, j));
  if (ctx.signal.aborted) throw stopped(ctx.signal);
  const [only] = settled;
  if (only!.status === "rejected") throw only!.reason;
  return { output: buildOutput([only!.value.result], [], only!.value.warnings) };
}

function prepareRun(db: Db, input: DecomposerRunInput): DecomposerRunInput {
  input.taskIds?.forEach((id, i) => {
    if (!findTask(db, id)) throw invalidField(`taskIds.${i}`, `Task ${id} does not exist`);
  });
  return input;
}

function prepareClarify(db: Db, input: ClarifyInput): ClarifyInput {
  const suggestion = findSuggestion(db, input.suggestionId);
  if (!suggestion) throw notFound(`Suggestion ${input.suggestionId} not found`);
  if (suggestion.kind !== "clarification") {
    throw invalidField(
      "suggestionId",
      `Suggestion ${suggestion.id} is a ${suggestion.kind} suggestion, not a clarification`,
    );
  }
  if (suggestion.status !== "pending") {
    throw conflict(`Suggestion ${suggestion.id} is ${suggestion.status}, not pending`);
  }
  return input;
}

const decompositionMode = (db: Db) => appliedMode(requestedMode(db));

export function createDecomposerAgent(loops: Partial<DecomposerLoops> = {}) {
  const names = { ...DECOMPOSER_LOOPS, ...loops };
  return defineAgent({
    name: "decomposer",
    promptVersion: DECOMPOSER_PROMPT_VERSION,
    input: decomposerRunInputSchema,
    output: decomposerOutputSchema,
    prepare: prepareRun,
    mode: decompositionMode,
    run: (ctx, input) => runBatch(ctx, names, input),
  });
}

export function createDecomposerClarifyAgent(loops: Partial<Pick<DecomposerLoops, "task">> = {}) {
  const names = { task: loops.task ?? DECOMPOSER_LOOPS.task };
  return defineAgent({
    name: "decomposer",
    promptVersion: DECOMPOSER_PROMPT_VERSION,
    input: clarifyInputSchema,
    output: decomposerOutputSchema,
    prepare: prepareClarify,
    mode: decompositionMode,
    run: (ctx, input) => runClarify(ctx, names, input),
  });
}

export const decomposerAgent = createDecomposerAgent();
export const decomposerClarifyAgent = createDecomposerClarifyAgent();
