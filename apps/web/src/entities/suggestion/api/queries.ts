"use client";

import { listSuggestionsResponseSchema } from "@postdog/shared";
import useSWR from "swr";
import { fetcherFor } from "@/shared/api";
import { suggestionKeys, type SuggestionsQuery } from "./keys";

const fetchSuggestions = fetcherFor(listSuggestionsResponseSchema);

/**
 * Suggestions, oldest first. Pending ones by default. With targetId, a related suggestion
 * matches every task in its group. The route answers 403 while AI is off, so pass
 * enabled = aiEnabled.
 */
export function useSuggestions(query: SuggestionsQuery = {}, enabled = true) {
  return useSWR(enabled ? suggestionKeys.list(query) : null, fetchSuggestions);
}
