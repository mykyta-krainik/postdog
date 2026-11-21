import { cn } from "@/shared/lib/utils";

/** A dog-eared note: the Postdog mark. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className={cn("size-5 shrink-0", className)}>
      <path
        d="M5 2h7.5L18 7.5V15a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3Z"
        fill="var(--brand)"
      />
      <path d="M12.5 2v3.5a2 2 0 0 0 2 2H18Z" fill="var(--brand-foreground)" opacity="0.3" />
      <path
        d="M6 11h6M6 14h4"
        stroke="var(--brand-foreground)"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}

export function Wordmark({
  className,
  textClassName,
}: {
  className?: string;
  textClassName?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <LogoMark />
      <span
        className={cn(
          "text-[15px] font-semibold tracking-[-0.02em] text-foreground",
          textClassName,
        )}
      >
        postdog
      </span>
    </span>
  );
}
