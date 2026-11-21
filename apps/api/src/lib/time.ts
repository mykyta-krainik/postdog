export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export function daysBefore(now: number, days: number): number {
  return Math.round(now - days * DAY_MS);
}
