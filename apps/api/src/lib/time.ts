const DAY_MS = 24 * 60 * 60 * 1000;

export function daysBefore(now: number, days: number): number {
  return Math.round(now - days * DAY_MS);
}
