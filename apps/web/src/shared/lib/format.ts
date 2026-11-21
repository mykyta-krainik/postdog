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
