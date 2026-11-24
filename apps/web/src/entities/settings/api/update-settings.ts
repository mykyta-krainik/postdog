import { settingsSchema, type Settings, type UpdateSettingsInput } from '@postdog/shared';
import { mutate } from 'swr';
import { apiRequest, settingsKey } from '@/shared/api';

function applyPatch(settings: Settings, patch: UpdateSettingsInput): Settings {
  const changes = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  );
  return { ...settings, ...changes };
}

/**
 * Saves a settings change. Every useSettings() caller shows it at once and rolls back if the API
 * rejects it. Resolves with the settings the API saved, and rethrows the ApiError otherwise.
 */
export async function updateSettings(patch: UpdateSettingsInput): Promise<Settings> {
  const request = apiRequest(settingsKey, settingsSchema, { method: 'PATCH', body: patch });
  await mutate<Settings | undefined>(settingsKey, request, {
    optimisticData: (_committed, displayed) => displayed && applyPatch(displayed, patch),
    rollbackOnError: true,
    populateCache: true,
    revalidate: false,
  });
  return request;
}
