import type { Changeset, DecomposerRelatedResult, DecomposerTaskResult } from '@postdog/shared';
import type { Executor } from '../../db/client';
import { listOf, plural } from '../../lib/text';
import { findChangesetByRun } from '../../repositories/changesets';
import { insertNotification } from '../../repositories/notifications';
import { findTask } from '../../repositories/tasks';

/** What stage 3 wrote during one run, in the order it wrote it. */
export interface RunWrites {
  tasks: DecomposerTaskResult[];
  related: DecomposerRelatedResult[];
}

/** The numbers behind an auto run's summary. */
export interface AutoRunTally {
  splitTasks: number;
  createdSubtasks: number;
  linkedTasks: number;
  needAnswers: number;
  duplicateTasks: number;
}

export interface Message {
  title: string;
  body: string;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const tasksThat = (n: number, one: string, many: string) =>
  `${plural(n, 'task')} ${n === 1 ? one : many}`;

export function tallyAutoRun(writes: RunWrites, changeset: Changeset | undefined): AutoRunTally {
  const count = (outcome: DecomposerTaskResult['outcome']) =>
    writes.tasks.filter((t) => t.outcome === outcome).length;
  const tasksIn = (groups: readonly DecomposerRelatedResult[]) =>
    new Set(groups.flatMap((g) => g.taskIds)).size;
  return {
    splitTasks: count('applied_subtasks'),
    createdSubtasks: changeset?.ops.filter((op) => op.type === 'create_task').length ?? 0,
    linkedTasks: tasksIn(writes.related.filter((g) => g.applied)),
    needAnswers: count('needs_clarification'),
    duplicateTasks: tasksIn(
      writes.related.filter((g) => !g.applied && g.relation === 'duplicates'),
    ),
  };
}

/**
 * "Split 4 tasks into 13 subtasks, linked 2 related tasks, 2 tasks need your answers."
 * Null when the run applied nothing and left nothing for the user.
 */
export function autoRunMessage(tally: AutoRunTally, stoppedEarly: boolean): Message | null {
  const { splitTasks, createdSubtasks, linkedTasks, needAnswers, duplicateTasks } = tally;
  const parts = [
    splitTasks > 0 &&
      `split ${plural(splitTasks, 'task')} into ${plural(createdSubtasks, 'subtask')}`,
    linkedTasks > 0 && `linked ${plural(linkedTasks, 'related task')}`,
    needAnswers > 0 && tasksThat(needAnswers, 'needs your answers', 'need your answers'),
    duplicateTasks > 0 && tasksThat(duplicateTasks, 'may be a duplicate', 'may be duplicates'),
  ].filter((part) => part !== false);
  if (parts.length === 0) return null;
  const stopped = stoppedEarly ? ' The run stopped before it finished; what it did is kept.' : '';
  return { title: capitalize(parts[0]!), body: `${capitalize(parts.join(', '))}.${stopped}` };
}

/** The tasks auto mode skipped because the user edited them during the run. */
export function conflictMessage(identifiers: readonly string[]): Message | null {
  const n = identifiers.length;
  if (n === 0) return null;
  const [they, were] = n === 1 ? ['it', 'was'] : ['they', 'were'];
  return {
    title:
      n === 1
        ? `${identifiers[0]} was edited during the run`
        : `${n} tasks were edited during the run`,
    body: `The Decomposer skipped ${listOf(identifiers)} because ${they} ${were} edited during the run. Nothing was changed; ${they} can be decomposed again.`,
  };
}

/**
 * Writes the auto run's notifications: a conflict for the tasks it skipped because the user
 * edited them, then the summary with the run's changeset. Deleted tasks are not listed.
 */
export function notifyAutoRun(
  ex: Executor,
  runId: number,
  writes: RunWrites,
  stoppedEarly: boolean,
  now: number,
): void {
  const changeset = findChangesetByRun(ex, runId);
  const edited = writes.tasks
    .filter((t) => t.outcome === 'superseded' && findTask(ex, t.taskId) !== undefined)
    .map((t) => t.identifier);
  const conflict = conflictMessage(edited);
  const summary = autoRunMessage(tallyAutoRun(writes, changeset), stoppedEarly);
  ex.transaction((tx) => {
    if (conflict) insertNotification(tx, { kind: 'conflict', ...conflict, runId, createdAt: now });
    if (summary) {
      insertNotification(tx, {
        kind: 'auto_decomposition',
        ...summary,
        runId,
        changesetId: changeset?.id ?? null,
        createdAt: now,
      });
    }
  });
}
