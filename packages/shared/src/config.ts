import type { Priority } from "./enums";

export const STALE_IN_PROGRESS_DAYS = 5;

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
} as const;
