"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  acceptSuggestion,
  rejectSuggestion,
  toReviewError,
  type AcceptValues,
  type ReviewError,
} from "@/entities/suggestion";

export type ReviewState =
  | { status: "idle" }
  | { status: "saving"; action: "accept" | "reject" }
  | { status: "error"; error: ReviewError };

export type Review = {
  state: ReviewState;
  saving: boolean;
  /** `done` is the toast once it is applied, such as "Added 4 subtasks to PD-12". */
  accept: (values: AcceptValues, done: string) => void;
  reject: () => void;
  dismissError: () => void;
};

/**
 * Accept or reject one suggestion. A success leaves the state on saving, since the refetched
 * task no longer lists the suggestion and the card goes away. A suggestion someone else
 * handled goes the same way, with a toast that says so. Other errors stay on the card.
 */
export function useReview(suggestionId: number, identifier: string): Review {
  const [state, setState] = useState<ReviewState>({ status: "idle" });
  const saving = state.status === "saving";

  const send = (action: "accept" | "reject", request: () => Promise<unknown>, done: string) => {
    if (saving) return;
    setState({ status: "saving", action });
    request().then(
      () => toast.success(done),
      (cause: unknown) => {
        const error = toReviewError(cause, identifier);
        if (error.kind === "handled") {
          toast.message(error.message);
          setState({ status: "idle" });
        } else {
          setState({ status: "error", error });
        }
      },
    );
  };

  return {
    state,
    saving,
    accept: (values, done) => send("accept", () => acceptSuggestion(suggestionId, values), done),
    reject: () => send("reject", () => rejectSuggestion(suggestionId), "Suggestion rejected"),
    dismissError: () => setState({ status: "idle" }),
  };
}
