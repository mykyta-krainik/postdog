import type { AgentRunSummary, RunStatus } from '@postdog/shared';
import { formatElapsed, formatRelativeTime } from '@/shared/lib/format';
import { AGENT_META } from './agents';

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

/** The run's one-line label, or the agent's name when the API sent an empty one. */
export function runTitle(run: Pick<AgentRunSummary, 'agent' | 'label'>): string {
  return run.label.trim() || `${AGENT_META[run.agent].label} run`;
}

/** "Started 5 min ago, took 12 s", or "Started just now, still running". */
export function runTimingText(
  run: Pick<AgentRunSummary, 'status' | 'startedAt' | 'finishedAt'>,
  now = Date.now(),
): string {
  const started = `Started ${formatRelativeTime(run.startedAt, now)}`;
  if (run.status === 'running' || run.finishedAt === null) return `${started}, still running`;
  return `${started}, took ${formatElapsed(run.finishedAt - run.startedAt)}`;
}
