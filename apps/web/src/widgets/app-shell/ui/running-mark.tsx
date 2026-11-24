import { LoaderCircle } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { runningText } from "../config/nav";

/** A spinner and the number of runs going now, on the Runs nav item. Renders nothing at zero. */
export function RunningMark({ count, className }: { count: number; className?: string }) {
  if (count < 1) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11px] font-medium text-brand-text tabular-nums",
        className,
      )}
    >
      <LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" aria-hidden />
      <span aria-hidden>{count}</span>
      <span className="sr-only">{runningText(count)}</span>
    </span>
  );
}
