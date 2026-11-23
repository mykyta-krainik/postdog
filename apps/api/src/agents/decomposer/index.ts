import {
  AGENT_LIMITS,
  clarifyInputSchema,
  decomposerOutputSchema,
  decomposerRunInputSchema,
  type AgentWarning,
  type Changeset,
  type ChangesetOpType,
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
import { findChangesetByRun } from "../../repositories/changesets";
import { releaseTaskClaim, renewClaims, tryClaim } from "../../repositories/claims";
import { findSuggestion, resolveSuggestion } from "../../repositories/suggestions";
import { findTask } from "../../repositories/tasks";
import { defineAgent, type AgentContext } from "../core/definition";
import { AgentError } from "../core/errors";
import { registerMockScript } from "../core/llm";
import { runAgent } from "../core/runAgent";
import type { TraceRecorder } from "../core/trace";
import {
  applierFor,
  decompositionMode,
  writeConflict,
  type ApplyRun,
  type RelatedApplied,
} from "./apply";
import { claimedResult, eligibilityCheck, exclusion, selectBatch, taskResult } from "./eligibility";
import { relatedMockScript, taskMockScript } from "./mock";
import { notifyAutoRun, type RunWrites } from "./notify";
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
  "applied_subtasks",
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

/**
 * Stage 3 for one run, in the run's mode: each result is applied in its own transaction, so
 * a failure writes nothing of that task, and what was written is kept for the notifications.
 */
function createStage3(ctx: AgentContext) {
  const applier = applierFor(ctx.mode);
  const writes: RunWrites = { tasks: [], related: [] };
  return {
    writes,
    /** A settled result also supersedes the clarification it answers, in the same transaction. */
    task(task: TaskRow, decision: Decision, supersedes?: number): DecomposerTaskResult {
      const run = applyRun(ctx);
      const result = ctx.db.transaction((tx) => {
        const conflict = writeConflict(tx, run, task, supersedes);
        if (conflict) return taskResult(task, "superseded", conflict);
        const applied = applier.task(tx, run, task, decision);
        if (supersedes !== undefined && SETTLED_OUTCOMES.has(applied.outcome)) {
          resolveSuggestion(tx, supersedes, "superseded", run.now);
        }
        return applied;
      });
      writes.tasks.push(result);
      return result;
    },
    related(group: RelatedPayload): RelatedApplied {
      const applied = ctx.db.transaction((tx) => applier.related(tx, applyRun(ctx), group));
      if (applied.saved) {
        const { suggestionId, applied: linked } = applied;
        writes.related.push({
          suggestionId,
          relation: group.relation,
          taskIds: group.taskIds,
          applied: linked,
        });
      }
      return applied;
    },
  };
}

type Stage3 = ReturnType<typeof createStage3>;

/**
 * Runs the work with a fresh stage 3. An auto run writes its notifications at the end, also
 * when it is cancelled or fails after applying something, so applied work is never hidden.
 */
async function withStage3(
  ctx: AgentContext,
  work: (stage3: Stage3) => Promise<{ output: DecomposerOutput }>,
): Promise<{ output: DecomposerOutput }> {
  const stage3 = createStage3(ctx);
  let finished = false;
  try {
    const result = await work(stage3);
    finished = true;
    return result;
  } finally {
    if (ctx.mode === "auto") notifyAutoRun(ctx.db, ctx.runId, stage3.writes, !finished, Date.now());
  }
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
  changeset: Changeset | undefined,
): DecomposerOutput {
  const count = (outcome: DecomposerOutcome) => tasks.filter((t) => t.outcome === outcome).length;
  const ops = (type: ChangesetOpType) =>
    changeset?.ops.filter((op) => op.type === type).length ?? 0;
  return {
    tasks,
    related,
    changesetId: changeset?.id ?? null,
    counts: {
      considered: tasks.length,
      suggestedSubtasks: count("suggested_subtasks"),
      appliedSubtasks: count("applied_subtasks"),
      createdSubtasks: ops("create_task"),
      appliedLinks: ops("create_link"),
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

function leftAlone(ctx: AgentContext, result: DecomposerTaskResult): TaskDone {
  ctx.trace.record({
    type: "validation",
    input: result.taskId,
    outputSummary: result.detail,
    durationMs: 0,
  });
  return { result, warnings: [] };
}

/**
 * The task read again once this run holds its claim, because another run or the user may
 * have changed it since stage 0. A clarify rerun is held only to the write checks: the user
 * asked for it, so stage 0's rules (todo, cooldown) do not apply.
 */
function recheck(ctx: AgentContext, job: TaskJob): DecomposerTaskResult | undefined {
  const fresh = findTask(ctx.db, job.task.id);
  if (fresh && job.supersedes === undefined) {
    const excluded = exclusion(ctx.db, fresh, eligibilityCheck(ctx.db, ctx.runId, Date.now()));
    if (excluded) return excluded;
  }
  const conflict = writeConflict(ctx.db, applyRun(ctx), job.task, job.supersedes);
  return conflict === null ? undefined : taskResult(job.task, "superseded", conflict);
}

/**
 * Stage 2 and 3 for one task: claim it, check it again, run its loop, check the output and
 * apply it. When it re-runs a clarification, the old one is superseded only together with a
 * settled result; a failed loop leaves it pending.
 */
async function decomposeTask(
  ctx: AgentContext,
  loop: string,
  stage3: Stage3,
  job: TaskJob,
): Promise<TaskDone> {
  const { task } = job;
  if (ctx.signal.aborted) throw stopped(ctx.signal);
  const claim = tryClaim(ctx.db, task.id, ctx.runId, "decomposer", Date.now());
  if (!claim.claimed) return leftAlone(ctx, claimedResult(task, claim.heldBy));
  try {
    const refused = recheck(ctx, job);
    if (refused) return leftAlone(ctx, refused);
    const trace = traceFor(ctx.trace, task.identifier);
    const loopResult = await runTaskLoop(ctx, loop, job, trace);
    const { decision, dropped } = decide(ctx, task, loopResult);
    recordDropped(trace, loopResult.toolName, dropped);
    if (ctx.signal.aborted) throw stopped(ctx.signal);
    const result = stage3.task(task, decision, job.supersedes);
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
  stage3: Stage3,
): Promise<{ output: DecomposerOutput }> {
  const batch = selectBatch(ctx.db, input.taskIds, ctx.runId, ctx.startedAt);
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
    const none = [{ message: "No eligible tasks" }];
    return { output: buildOutput(batch.excluded, [], none, undefined) };
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

  const suggestionOf = new Map<RelatedPayload, number>();
  for (const group of groups) {
    const applied = stage3.related(group);
    if (applied.saved) suggestionOf.set(group, applied.suggestionId);
    else warnings.push(applied.warning);
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
    decomposeTask(ctx, loops.task, stage3, job),
  );
  if (ctx.signal.aborted) throw stopped(ctx.signal);

  const done = settled.map((s, i): TaskDone =>
    s.status === "fulfilled"
      ? s.value
      : { result: failedResult(jobs[i]!.task, s.reason), warnings: [] },
  );
  const output = buildOutput(
    [...done.map((d) => d.result), ...duplicates, ...batch.excluded],
    stage3.writes.related,
    [...warnings, ...done.flatMap((d) => d.warnings)],
    findChangesetByRun(ctx.db, ctx.runId),
  );
  failIfNothingWorked(settled, output);
  return { output };
}

async function runClarify(
  ctx: AgentContext,
  loops: Pick<DecomposerLoops, "task">,
  input: ClarifyInput,
  stage3: Stage3,
): Promise<{ output: DecomposerOutput }> {
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
  const settled = await settleEach([job], 1, (j) => decomposeTask(ctx, loops.task, stage3, j));
  if (ctx.signal.aborted) throw stopped(ctx.signal);
  const [only] = settled;
  if (only!.status === "rejected") throw only!.reason;
  const { result, warnings } = only!.value;
  return {
    output: buildOutput([result], [], warnings, findChangesetByRun(ctx.db, ctx.runId)),
  };
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

export function createDecomposerAgent(loops: Partial<DecomposerLoops> = {}) {
  const names = { ...DECOMPOSER_LOOPS, ...loops };
  return defineAgent({
    name: "decomposer",
    promptVersion: DECOMPOSER_PROMPT_VERSION,
    input: decomposerRunInputSchema,
    output: decomposerOutputSchema,
    prepare: prepareRun,
    mode: decompositionMode,
    run: (ctx, input) => withStage3(ctx, (stage3) => runBatch(ctx, names, input, stage3)),
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
    run: (ctx, input) => withStage3(ctx, (stage3) => runClarify(ctx, names, input, stage3)),
  });
}

export const decomposerAgent = createDecomposerAgent();
export const decomposerClarifyAgent = createDecomposerClarifyAgent();
