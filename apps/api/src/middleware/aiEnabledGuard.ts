import type { RequestHandler } from "express";
import { AppError } from "../lib/errors";
import type { SettingsService } from "../services/settings";

export function aiEnabledGuard(settings: Pick<SettingsService, "get">): RequestHandler {
  return (_req, _res, next) => {
    if (settings.get().aiEnabled) return next();
    next(new AppError(403, "ai_disabled", "AI is turned off in Settings."));
  };
}
