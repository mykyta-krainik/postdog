import { mutate } from 'swr';
import { ApiError } from './api-error';
import { apiKey } from './keys';

/** The settings resource. Every AI entry point reads aiEnabled from it. */
export const settingsKey = apiKey('/settings');

/**
 * A 403 ai_disabled means AI was turned off somewhere else, such as another tab. Refetching the
 * settings hides every AI entry point now, instead of on the next window focus.
 */
export function revalidateSettingsOnAiDisabled(error: unknown): void {
  if (error instanceof ApiError && error.code === 'ai_disabled') void mutate(settingsKey);
}

/** Awaits a request to an AI route. Refetches the settings when it fails with ai_disabled. */
export async function aiRequest<T>(request: Promise<T>): Promise<T> {
  try {
    return await request;
  } catch (error) {
    revalidateSettingsOnAiDisabled(error);
    throw error;
  }
}
