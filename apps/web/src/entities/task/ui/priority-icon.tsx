import type { Priority } from "@postdog/shared";
import { cn } from "@/shared/lib/utils";

/** Label, filled bar count and colour of each priority. Every priority UI reads this table. */
export const TASK_PRIORITY_META: Record<
  Priority,
  { label: string; shortLabel: string; bars: 1 | 2 | 3; className: string }
> = {
  low: { label: "Low priority", shortLabel: "Low", bars: 1, className: "text-muted-foreground" },
  medium: {
    label: "Medium priority",
    shortLabel: "Medium",
    bars: 2,
    className: "text-muted-foreground",
  },
  high: { label: "High priority", shortLabel: "High", bars: 3, className: "text-foreground" },
};

const BARS = [
  { x: 1.5, y: 8, height: 4.5 },
  { x: 5.75, y: 5, height: 7.5 },
  { x: 10, y: 2, height: 10.5 },
];

export function PriorityIcon({ priority, className }: { priority: Priority; className?: string }) {
  const { label, bars, className: tone } = TASK_PRIORITY_META[priority];
  return (
    <svg
      viewBox="0 0 14 14"
      role="img"
      aria-label={label}
      className={cn("size-3.5 shrink-0", tone, className)}
    >
      {BARS.map((bar, index) => (
        <rect
          key={bar.x}
          x={bar.x}
          y={bar.y}
          width="2.5"
          height={bar.height}
          rx="0.75"
          fill="currentColor"
          opacity={index < bars ? 1 : 0.25}
        />
      ))}
    </svg>
  );
}
