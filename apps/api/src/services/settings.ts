import { DEFAULT_SETTINGS, type Settings, type UpdateSettingsInput } from "@postdog/shared";
import { AgentError } from "../agents/core/errors";
import type { Db, Executor } from "../db/client";
import { getSetting, setSetting } from "../repositories/settings";
import type { AgentRunService } from "./agentRuns";

/** The stored settings, with the default for each key a database does not have yet. */
export function readSettings(ex: Executor): Settings {
  return {
    aiEnabled: getSetting(ex, "aiEnabled") ?? DEFAULT_SETTINGS.aiEnabled,
    decompositionMode: getSetting(ex, "decompositionMode") ?? DEFAULT_SETTINGS.decompositionMode,
    scheduledRunsEnabled:
      getSetting(ex, "scheduledRunsEnabled") ?? DEFAULT_SETTINGS.scheduledRunsEnabled,
  };
}

export function createSettingsService(db: Db, runs: Pick<AgentRunService, "cancelAll">) {
  const get = () => readSettings(db);

  return {
    get,

    update(input: UpdateSettingsInput): Settings {
      db.transaction((tx) => {
        if (input.aiEnabled !== undefined) setSetting(tx, "aiEnabled", input.aiEnabled);
        if (input.decompositionMode !== undefined) {
          setSetting(tx, "decompositionMode", input.decompositionMode);
        }
        if (input.scheduledRunsEnabled !== undefined) {
          setSetting(tx, "scheduledRunsEnabled", input.scheduledRunsEnabled);
        }
      });
      if (input.aiEnabled === false) {
        runs.cancelAll(new AgentError("ai_disabled", "AI was turned off in Settings."));
      }
      return get();
    },
  };
}

export type SettingsService = ReturnType<typeof createSettingsService>;
