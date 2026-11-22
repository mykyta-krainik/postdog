"use client";

import { AlertTriangle, LoaderCircle, RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/shared/ui/button";
import type { Review } from "../model/use-review";

const ACTION = "h-10 gap-1.5 px-3 text-[13px] md:h-8";

/**
 * Reject and Accept for one suggestion, and what went wrong. A stale target offers Reload, which
 * takes the task as it is now as the base for the next accept.
 */
export function ReviewActions({
  review,
  acceptLabel,
  acceptDisabled = false,
  onAccept,
  onReload,
  hint,
}: {
  review: Review;
  acceptLabel: string;
  acceptDisabled?: boolean;
  onAccept: () => void;
  onReload: () => void;
  hint?: ReactNode;
}) {
  const { state, saving } = review;
  const busy = (action: "accept" | "reject") =>
    state.status === "saving" && state.action === action;

  return (
    <div className="flex flex-col gap-2">
      {state.status === "error" && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-md border border-destructive/35 bg-destructive/5 px-3 py-2"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <p className="min-w-0 flex-1 text-[13px] text-foreground">{state.error.message}</p>
          {state.error.kind === "stale" && (
            <Button
              variant="outline"
              size="sm"
              className={`${ACTION} shrink-0`}
              onClick={() => {
                onReload();
                review.dismissError();
              }}
            >
              <RotateCw className="size-3.5" aria-hidden />
              Reload
            </Button>
          )}
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {hint && <div className="min-w-0 flex-1 text-xs text-muted-foreground">{hint}</div>}
        <div className="flex items-center justify-end gap-2 sm:ml-auto">
          <Button
            variant="ghost"
            size="sm"
            className={ACTION}
            disabled={saving}
            onClick={review.reject}
          >
            {busy("reject") && (
              <LoaderCircle
                className="size-3.5 animate-spin motion-reduce:animate-none"
                aria-hidden
              />
            )}
            Reject
          </Button>
          <Button
            size="sm"
            className={ACTION}
            disabled={saving || acceptDisabled}
            onClick={onAccept}
          >
            {busy("accept") && (
              <LoaderCircle
                className="size-3.5 animate-spin motion-reduce:animate-none"
                aria-hidden
              />
            )}
            {acceptLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
