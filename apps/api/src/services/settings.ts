import { DEFAULT_SETTINGS, type Settings, type UpdateSettingsInput } from "@postdog/shared";
import type { Db } from "../db/client";
import { getSetting, setSetting } from "../repositories/settings";

export function createSettingsService(db: Db) {
  function get(): Settings {
    return {
      aiEnabled: getSetting(db, "aiEnabled") ?? DEFAULT_SETTINGS.aiEnabled,
      decompositionMode: getSetting(db, "decompositionMode") ?? DEFAULT_SETTINGS.decompositionMode,
    };
  }

  return {
    get,

    update(input: UpdateSettingsInput): Settings {
      db.transaction((tx) => {
        if (input.aiEnabled !== undefined) setSetting(tx, "aiEnabled", input.aiEnabled);
        if (input.decompositionMode !== undefined) {
          setSetting(tx, "decompositionMode", input.decompositionMode);
        }
      });
      return get();
    },
  };
}

export type SettingsService = ReturnType<typeof createSettingsService>;
