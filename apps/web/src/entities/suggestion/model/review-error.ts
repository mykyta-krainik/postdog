import { ApiError } from '@/shared/api';

/**
 * Why an accept or reject failed, for the user. `handled`: the suggestion is no longer pending.
 * `failed`: anything else, such as a target task that changed in another tab.
 */
export type ReviewError = { kind: 'handled' | 'failed'; message: string };

/** `identifier` names the target task, such as "PD-12". */
export function toReviewError(error: unknown, identifier: string): ReviewError {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'stale':
        return {
          kind: 'failed',
          message: `${identifier} changed while you were reviewing. Check that this still fits, then accept again.`,
        };
      case 'conflict':
        return { kind: 'handled', message: 'Someone already handled this suggestion.' };
      case 'not_found':
        return {
          kind: 'handled',
          message: 'This suggestion is gone. Its task may have been deleted.',
        };
      case 'ai_disabled':
        return {
          kind: 'failed',
          message: 'AI is turned off. Turn it on in Settings to review this.',
        };
      case 'network_error':
        return { kind: 'failed', message: "Postdog can't reach the API. Try again in a moment." };
      default:
        return { kind: 'failed', message: error.message };
    }
  }
  return { kind: 'failed', message: 'Something went wrong. Try again.' };
}
