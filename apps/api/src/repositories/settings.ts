import { eq } from "drizzle-orm";
import type { Executor } from "../db/client";
import { settings, type SettingKey, type StoredSettings } from "../db/schema";

export function getSetting<K extends SettingKey>(
  ex: Executor,
  key: K,
): StoredSettings[K] | undefined {
  const row = ex
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .get();
  return row?.value as StoredSettings[K] | undefined;
}

export function setSetting<K extends SettingKey>(
  ex: Executor,
  key: K,
  value: StoredSettings[K],
): void {
  ex.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}

/** Writes the value only when the key has none yet. */
export function initSetting<K extends SettingKey>(
  ex: Executor,
  key: K,
  value: StoredSettings[K],
): void {
  ex.insert(settings).values({ key, value }).onConflictDoNothing().run();
}
