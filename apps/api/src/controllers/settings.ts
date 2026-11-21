import type { Settings, UpdateSettingsInput } from "@postdog/shared";
import type { Request, Response } from "express";
import type { SettingsService } from "../services/settings";

export function createSettingsController(settings: SettingsService) {
  return {
    get: (_req: Request, res: Response<Settings>) => {
      res.json(settings.get());
    },
    update: (req: Request<unknown, unknown, UpdateSettingsInput>, res: Response<Settings>) => {
      res.json(settings.update(req.body));
    },
  };
}

export type SettingsController = ReturnType<typeof createSettingsController>;
