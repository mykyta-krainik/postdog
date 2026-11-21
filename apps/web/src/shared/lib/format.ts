const sameYear = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
const otherYear = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const full = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

/** "Nov 12" for this year, "Nov 12, 2025" for other years. */
export function formatShortDate(timestamp: number, now = Date.now()): string {
  const date = new Date(timestamp);
  const format = date.getFullYear() === new Date(now).getFullYear() ? sameYear : otherYear;
  return format.format(date);
}

export function formatDateTime(timestamp: number): string {
  return full.format(new Date(timestamp));
}

const time = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" });

/** "9:42 AM" today, "Nov 12, 9:42 AM" on another day. */
export function formatDayTime(timestamp: number, now = Date.now()): string {
  const date = new Date(timestamp);
  if (date.toDateString() === new Date(now).toDateString()) return time.format(date);
  return `${formatShortDate(timestamp, now)}, ${time.format(date)}`;
}

/** "420 ms" below a second, "3.1 s" from a second. */
export function formatDuration(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

/** "940", "1.2K". */
export function formatCompactNumber(value: number): string {
  return compact.format(value);
}
