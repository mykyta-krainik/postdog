import { z } from "zod";
import { decompositionModeSchema } from "./enums";

export const settingsSchema = z.object({
  aiEnabled: z.boolean(),
  decompositionMode: decompositionModeSchema,
});
export type Settings = z.infer<typeof settingsSchema>;

export const updateSettingsInputSchema = settingsSchema.partial();
export type UpdateSettingsInput = z.infer<typeof updateSettingsInputSchema>;

export const DEFAULT_SETTINGS: Settings = {
  aiEnabled: true,
  decompositionMode: "suggest",
};
