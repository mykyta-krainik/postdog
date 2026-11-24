import { STALE_IN_PROGRESS_DAYS, type SubmitDailyPlanInput } from '@postdog/shared';
import type { MockScript } from '../core/llm';

const AGED_DAYS = 14;
const PLAN_SIZE = 3;

interface Candidate {
  id: number;
  status: string;
  priority: string;
  ageDays: number;
  daysInStatus: number;
  blocksOpenCount: number;
  isBlocked: boolean;
}

export function readCandidates(userMessage: string): Candidate[] {
  const block = /<candidates>\n([\s\S]*?)\n<\/candidates>/.exec(userMessage)?.[1];
  const [header = '', ...rows] = block?.split('\n') ?? [];
  const columns = header.split(' | ');
  return rows.map((line) => {
    const cells = line.split(' | ');
    const cell = (name: string) => cells[columns.indexOf(name)] ?? '';
    return {
      id: Number(cell('id')),
      status: cell('status'),
      priority: cell('priority'),
      ageDays: Number(cell('ageDays')),
      daysInStatus: Number(cell('daysInStatus')),
      blocksOpenCount: Number(cell('blocksOpenCount')),
      isBlocked: cell('isBlocked') === 'true',
    };
  });
}

function focusItem(task: Candidate): SubmitDailyPlanInput['focus'][number] {
  const reasons: string[] = [];
  const signals: string[] = [];
  if (task.status === 'in_progress' && task.daysInStatus > STALE_IN_PROGRESS_DAYS) {
    reasons.push(`In progress for ${task.daysInStatus} days; finish it before starting new work.`);
    signals.push(`in progress ${task.daysInStatus} days`);
  } else if (task.status === 'in_progress') {
    reasons.push('Already in progress.');
  }
  if (task.blocksOpenCount > 0) {
    const tasks = task.blocksOpenCount === 1 ? 'task' : 'tasks';
    reasons.push(`Unblocks ${task.blocksOpenCount} open ${tasks}.`);
    signals.push(`unblocks ${task.blocksOpenCount}`);
  }
  if (task.priority === 'high') {
    reasons.push('High priority.');
    signals.push('high priority');
  }
  if (task.ageDays >= AGED_DAYS) {
    reasons.push(`Open for ${task.ageDays} days.`);
    signals.push(`open ${task.ageDays} days`);
  }
  return {
    taskId: task.id,
    reason: reasons.length > 0 ? reasons.join(' ') : 'Next in the ranked list.',
    signals,
  };
}

export const plannerMockScript: MockScript = ({ userMessage, turn }) => {
  const ready = readCandidates(userMessage).filter((task) => !task.isBlocked);
  const top = ready[0];
  if (!top) return { text: 'No task in the table is ready to start.' };
  if (turn === 1) return { toolCalls: [{ toolName: 'get_task', input: { id: top.id } }] };
  const focus = ready.slice(0, PLAN_SIZE).map(focusItem);
  return { toolCalls: [{ toolName: 'submit_daily_plan', input: { focus, warnings: [] } }] };
};
