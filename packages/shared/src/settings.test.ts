import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, settingsSchema, updateSettingsInputSchema } from '@postdog/shared';

describe('updateSettingsInputSchema', () => {
  it('returns only the fields that were sent', () => {
    expect(updateSettingsInputSchema.parse({ aiEnabled: false })).toEqual({ aiEnabled: false });
    expect(updateSettingsInputSchema.parse({})).toEqual({});
  });

  it('rejects an unknown decomposition mode', () => {
    expect(updateSettingsInputSchema.safeParse({ decompositionMode: 'yolo' }).success).toBe(false);
  });

  it('rejects a non-boolean aiEnabled or scheduledRunsEnabled', () => {
    expect(updateSettingsInputSchema.safeParse({ aiEnabled: 'false' }).success).toBe(false);
    expect(updateSettingsInputSchema.safeParse({ scheduledRunsEnabled: 0 }).success).toBe(false);
  });
});

describe('DEFAULT_SETTINGS', () => {
  it('turns AI on in suggest mode, with the daily runs on', () => {
    expect(settingsSchema.parse(DEFAULT_SETTINGS)).toEqual({
      aiEnabled: true,
      decompositionMode: 'suggest',
      scheduledRunsEnabled: true,
    });
  });
});
