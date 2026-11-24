import {
  changesetSchema,
  changesetStatusOf,
  changesetTaskStateOf,
  type Changeset,
  type ChangesetOp,
  type ChangesetOpType,
  type ChangesetSummary,
} from '@postdog/shared';
import { eq, inArray } from 'drizzle-orm';
import type { Executor } from '../db/client';
import { agentChangesets, tasks, type AgentChangesetRow } from '../db/schema';

/** What the apply step records. Every new op is applied. */
export type NewChangesetOp = Omit<ChangesetOp, 'state'>;

export interface NewChangeset {
  runId: number;
  ops: readonly NewChangesetOp[];
  now: number;
}

function toChangeset(row: AgentChangesetRow): Changeset {
  return changesetSchema.parse(row);
}

function asApplied(ops: readonly NewChangesetOp[]): ChangesetOp[] {
  return ops.map((op) => ({ ...op, state: 'applied' }));
}

/** A run has at most one changeset: a second insert for the same run throws. */
export function insertChangeset(ex: Executor, { runId, ops, now }: NewChangeset): Changeset {
  const row = ex
    .insert(agentChangesets)
    .values({ runId, ops: asApplied(ops), createdAt: now })
    .returning()
    .get();
  return toChangeset(row);
}

export function findChangeset(ex: Executor, id: number): Changeset | undefined {
  const row = ex.select().from(agentChangesets).where(eq(agentChangesets.id, id)).get();
  return row && toChangeset(row);
}

export function findChangesetByRun(ex: Executor, runId: number): Changeset | undefined {
  const row = ex.select().from(agentChangesets).where(eq(agentChangesets.runId, runId)).get();
  return row && toChangeset(row);
}

/** Adds applied ops to the run's changeset, and creates the changeset on the first call. */
export function appendChangesetOps(ex: Executor, change: NewChangeset): Changeset {
  return ex.transaction((tx) => {
    const current = findChangesetByRun(tx, change.runId);
    if (!current) return insertChangeset(tx, change);
    return updateChangesetOps(tx, current.id, [...current.ops, ...asApplied(change.ops)])!;
  });
}

/**
 * Replaces the ops and stores the status they imply (`changesetStatusOf`), so the status
 * never disagrees with the ops. Undefined when the changeset does not exist.
 */
export function updateChangesetOps(
  ex: Executor,
  id: number,
  ops: readonly ChangesetOp[],
): Changeset | undefined {
  const row = ex
    .update(agentChangesets)
    .set({ ops: [...ops], status: changesetStatusOf(ops) })
    .where(eq(agentChangesets.id, id))
    .returning()
    .get();
  return row && toChangeset(row);
}

function countOfType(ops: readonly ChangesetOp[], type: ChangesetOpType): number {
  return ops.filter((op) => op.type === type).length;
}

/** One entry per task, lowest id first. A deleted task keeps its entry with a null name. */
export function summarizeChangeset(ex: Executor, changeset: Changeset): ChangesetSummary {
  const opsByTask = new Map<number, ChangesetOp[]>();
  for (const op of changeset.ops) {
    opsByTask.set(op.taskId, [...(opsByTask.get(op.taskId) ?? []), op]);
  }
  const taskIds = [...opsByTask.keys()].sort((a, b) => a - b);
  const names =
    taskIds.length === 0
      ? []
      : ex
          .select({ id: tasks.id, identifier: tasks.identifier, title: tasks.title })
          .from(tasks)
          .where(inArray(tasks.id, taskIds))
          .all();
  const nameOf = new Map(names.map((task) => [task.id, task]));

  return {
    id: changeset.id,
    runId: changeset.runId,
    status: changeset.status,
    createdAt: changeset.createdAt,
    tasks: taskIds.map((taskId) => {
      const ops = opsByTask.get(taskId)!;
      return {
        taskId,
        identifier: nameOf.get(taskId)?.identifier ?? null,
        title: nameOf.get(taskId)?.title ?? null,
        createdSubtasks: countOfType(ops, 'create_task'),
        createdLinks: countOfType(ops, 'create_link'),
        state: changesetTaskStateOf(ops),
      };
    }),
    counts: {
      subtasks: countOfType(changeset.ops, 'create_task'),
      links: countOfType(changeset.ops, 'create_link'),
    },
  };
}
