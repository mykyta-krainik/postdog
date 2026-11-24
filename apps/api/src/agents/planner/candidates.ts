import type { TaskFacts } from '../context';

export const SCORE_WEIGHTS = {
  staleInProgress: 100,
  inProgress: 25,
  priority: { high: 30, medium: 20, low: 10 },
  perOpenTaskUnblocked: 10,
  maxTasksUnblocked: 3,
  perDayOfAge: 1 / 3,
  maxAgeDays: 30,
  blocked: -1000,
} as const;

export function candidateScore(task: TaskFacts): number {
  const w = SCORE_WEIGHTS;
  const progress =
    task.status === 'in_progress' ? (task.isStale ? w.staleInProgress : w.inProgress) : 0;
  return (
    progress +
    w.priority[task.priority] +
    w.perOpenTaskUnblocked * Math.min(task.blocksOpenCount, w.maxTasksUnblocked) +
    w.perDayOfAge * Math.min(task.ageDays, w.maxAgeDays) +
    (task.isBlocked ? w.blocked : 0)
  );
}

export function rankCandidates(facts: readonly TaskFacts[]): TaskFacts[] {
  return facts
    .filter((task) => task.status !== 'done' && task.parentId === null)
    .map((task) => ({ task, score: candidateScore(task) }))
    .sort((a, b) => b.score - a.score || a.task.id - b.task.id)
    .map(({ task }) => task);
}
