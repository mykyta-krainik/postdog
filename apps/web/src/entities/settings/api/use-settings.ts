"use client";

import { settingsSchema } from "@postdog/shared";
import useSWR from "swr";
import { apiKey, fetcherFor } from "@/shared/api";

export const settingsKey = apiKey("/settings");

const fetchSettings = fetcherFor(settingsSchema);

/**
 * aiEnabled stays false until the settings load, and when they fail to load,
 * so an AI entry point never flashes in and out.
 */
export function useSettings() {
  const { data, error, isLoading, mutate } = useSWR(settingsKey, fetchSettings);
  return { settings: data, aiEnabled: data?.aiEnabled ?? false, error, isLoading, mutate };
}
