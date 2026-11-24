import { z } from 'zod';
import { decompositionModeSchema } from './enums';

export const settingsSchema = z.object({
  aiEnabled: z.boolean(),
  decompositionMode: decompositionModeSchema,
  /** The daily Planner and Status updater runs of SCHEDULED_RUNS. Nothing runs while AI is off. */
  scheduledRunsEnabled: z.boolean(),
});
export type Settings = z.infer<typeof settingsSchema>;

export const updateSettingsInputSchema = settingsSchema.partial();
export type UpdateSettingsInput = z.infer<typeof updateSettingsInputSchema>;

export const DEFAULT_SETTINGS: Settings = {
  aiEnabled: true,
  decompositionMode: 'suggest',
  scheduledRunsEnabled: true,
};
