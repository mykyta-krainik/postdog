import type { AgentName, Priority } from './enums';

export const STALE_IN_PROGRESS_DAYS = 5;

/**
 * The daily runs, at hour:minute in the API machine's local time zone (TZ changes it). Each
 * agent appears once: the API keeps one "last fired" date per agent.
 */
export const SCHEDULED_RUNS = [
  { agent: 'planner', hour: 8, minute: 0 },
  { agent: 'status_updater', hour: 18, minute: 0 },
] as const satisfies readonly { agent: AgentName; hour: number; minute: number }[];
export type ScheduledRun = (typeof SCHEDULED_RUNS)[number];
export type ScheduledAgent = ScheduledRun['agent'];

export const PRIORITY_RANK: Record<Priority, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

export const AGENT_LIMITS = {
  maxSteps: 8,
  wallClockMs: 60_000,
  maxConsecutiveValidationErrors: 2,
  maxPlannerCandidates: 30,
  maxStatusUpdateTasks: 15,
  statusUpdateDefaultWindowMs: 24 * 60 * 60 * 1000,
  maxDecomposerTasksPerRun: 10,
  decomposerConcurrency: 3,
  claimTtlMs: 2 * 60 * 1000,
  rejectedCooldownMs: 7 * 24 * 60 * 60 * 1000,
  maxSubtasks: 8,
} as const;
