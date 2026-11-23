import {
  acceptSuggestionResponseSchema,
  rejectSuggestionResponseSchema,
  type AcceptSuggestionResponse,
  type Suggestion,
  type SuggestionPayload,
} from "@postdog/shared";
import { mutate } from "swr";
import { aiRequest, apiKey, apiRequest } from "@/shared/api";
import { suggestionKeys } from "./keys";

/**
 * Refetches suggestions and every mounted task list and detail. Call it after anything that
 * changes suggestions: an accept or reject, and every settled Decomposer run.
 */
export function revalidateSuggestions() {
  return mutate(suggestionKeys.affectedBySuggestions);
}

export type AcceptValues = {
  /** The user's edited payload. Leave it out to apply the stored one. */
  payload?: SuggestionPayload;
  /** The target task's updatedAt as the UI shows it when the user accepts. */
  baseUpdatedAt: number;
};

/**
 * Applies a suggestion: creates the subtasks or the links. Answers 409 stale when the target
 * task changed since baseUpdatedAt, and 409 conflict when the suggestion is no longer pending.
 */
export async function acceptSuggestion(
  id: number,
  values: AcceptValues,
): Promise<AcceptSuggestionResponse> {
  try {
    return await aiRequest(
      apiRequest(apiKey(`/suggestions/${id}/accept`), acceptSuggestionResponseSchema, {
        method: "POST",
        body: values,
      }),
    );
  } finally {
    // A conflict means someone else handled it, and a stale target has new data: both refetch.
    await revalidateSuggestions();
  }
}

export async function rejectSuggestion(id: number): Promise<Suggestion> {
  try {
    return await aiRequest(
      apiRequest(apiKey(`/suggestions/${id}/reject`), rejectSuggestionResponseSchema, {
        method: "POST",
      }),
    );
  } finally {
    await revalidateSuggestions();
  }
}
