import type { AgentWarning, PlannerFocusItem, SubmitDailyPlanInput } from '@postdog/shared';
import type { TaskFacts } from '../context';

type FocusInput = SubmitDailyPlanInput['focus'][number];

export interface DroppedItem {
  item: FocusInput;
  warning: AgentWarning;
}

export interface CheckedPlan {
  focus: PlannerFocusItem[];
  dropped: DroppedItem[];
}

const MAX_BLOCKERS_NAMED = 3;

function blockerList(task: TaskFacts): string {
  const names = task.openBlockers.map((b) => b.identifier);
  const rest = names.length - MAX_BLOCKERS_NAMED;
  return names.slice(0, MAX_BLOCKERS_NAMED).join(', ') + (rest > 0 ? ` and ${rest} more` : '');
}

function rejection(task: TaskFacts, keptIds: ReadonlySet<number>): string | undefined {
  if (task.status === 'done') return 'it is already done';
  if (task.isBlocked) return `it is blocked by ${blockerList(task)} (still open)`;
  if (keptIds.has(task.id)) return 'it is already in the plan';
  return undefined;
}

export function checkPlan(focus: readonly FocusInput[], facts: readonly TaskFacts[]): CheckedPlan {
  const byId = new Map(facts.map((task) => [task.id, task]));
  const kept: PlannerFocusItem[] = [];
  const keptIds = new Set<number>();
  const dropped: DroppedItem[] = [];

  for (const item of focus) {
    const task = byId.get(item.taskId);
    if (!task) {
      dropped.push({
        item,
        warning: { message: `Task ${item.taskId} was left out: it does not exist.` },
      });
      continue;
    }
    const reason = rejection(task, keptIds);
    if (reason) {
      dropped.push({
        item,
        warning: { taskId: task.id, message: `${task.identifier} was left out: ${reason}.` },
      });
      continue;
    }
    keptIds.add(task.id);
    kept.push({ ...item, identifier: task.identifier, title: task.title });
  }
  return { focus: kept, dropped };
}
