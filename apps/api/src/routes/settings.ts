import { updateSettingsInputSchema } from "@postdog/shared";
import { Router } from "express";
import type { SettingsController } from "../controllers/settings";
import { validate } from "../middleware/validate";

export function settingsRoutes(settings: SettingsController): Router {
  return Router()
    .get("/settings", settings.get)
    .patch("/settings", validate({ body: updateSettingsInputSchema }), settings.update);
}
