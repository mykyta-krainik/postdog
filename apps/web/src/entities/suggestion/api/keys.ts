import { listSuggestionsQuerySchema } from '@postdog/shared';
import type { z } from 'zod';
import { apiKey, matchesApiPath } from '@/shared/api';

/** What a caller passes to the list endpoint. status defaults to pending. */
export type SuggestionsQuery = z.input<typeof listSuggestionsQuerySchema>;

export const suggestionKeys = {
  /** Normalized through the contract schema, so equal queries share one cache entry. */
  list: (query: SuggestionsQuery = {}) =>
    apiKey('/suggestions', listSuggestionsQuerySchema.parse(query)),

  /**
   * Keys whose data a suggestion changes: suggestion lists, and every task list and detail,
   * since aiState and pendingSuggestions follow the suggestions. Task notes are left out.
   */
  affectedBySuggestions: (key: unknown) =>
    matchesApiPath(key, '/suggestions') ||
    (matchesApiPath(key, '/tasks') && !String(key).endsWith('/notes')),
};
