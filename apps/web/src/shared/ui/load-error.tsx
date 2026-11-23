import { ApiError } from "@/shared/api";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

/** A request that failed to load, why, and Try again. */
export function LoadError({
  title,
  error,
  retrying,
  onRetry,
  className,
}: {
  title: string;
  error: unknown;
  retrying: boolean;
  onRetry: () => void;
  className?: string;
}) {
  const unreachable = error instanceof ApiError && error.code === "network_error";
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-start gap-3 rounded-md border border-border px-4 py-4",
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <p className="text-[13px] font-medium text-foreground">{title}</p>
        <p className="text-[13px] leading-5 text-muted-foreground">
          {unreachable
            ? "Postdog can't reach the API. Check that it is running, then try again."
            : error instanceof Error
              ? error.message
              : "The API returned an error."}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onRetry}
        disabled={retrying}
        className="max-md:h-10"
      >
        {retrying ? "Trying again…" : "Try again"}
      </Button>
    </div>
  );
}
