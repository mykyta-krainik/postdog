'use client';

import { settingsSchema } from '@postdog/shared';
import useSWR from 'swr';
import { fetcherFor, settingsKey } from '@/shared/api';

const fetchSettings = fetcherFor(settingsSchema);

/**
 * aiEnabled stays false until the settings load, and when they fail to load,
 * so an AI entry point never flashes in and out.
 */
export function useSettings() {
  const { data, error, isLoading, mutate } = useSWR(settingsKey, fetchSettings);
  return { settings: data, aiEnabled: data?.aiEnabled ?? false, error, isLoading, mutate };
}
