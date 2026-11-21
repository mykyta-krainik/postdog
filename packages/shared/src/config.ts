import type { Priority } from "./enums";

export const STALE_IN_PROGRESS_DAYS = 5;

export const PRIORITY_RANK: Record<Priority, number> = {
  low: 0,
  medium: 1,
  high: 2,
};
