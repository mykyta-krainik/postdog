'use client';

import { DECOMPOSITION_MODES, type DecompositionMode } from '@postdog/shared';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { updateSettings } from '@/entities/settings';
import { RadioGroup, RadioGroupItem } from '@/shared/ui/radio-group';
import { MODE_OPTIONS, needsConfirmation } from '../model/mode-change';
import { AutoModeDialog } from './auto-mode-dialog';

/** Suggest or Auto. An AI setting, so the page renders it only while AI is on. */
export function DecompositionModeSetting({ mode }: { mode: DecompositionMode }) {
  const id = useId();
  const [confirming, setConfirming] = useState(false);

  async function save(next: DecompositionMode) {
    try {
      await updateSettings({ decompositionMode: next });
    } catch (error) {
      toast.error(`Decomposition is still ${MODE_OPTIONS[mode].label}`, {
        description: error instanceof Error ? error.message : 'The API rejected the change.',
      });
    }
  }

  function choose(value: string) {
    const next = DECOMPOSITION_MODES.find((option) => option === value);
    if (!next || next === mode) return;
    if (needsConfirmation(mode, next)) setConfirming(true);
    else void save(next);
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-3.5">
      <div className="flex flex-col gap-1">
        <span id={`${id}-title`} className="text-[13px] font-medium text-foreground">
          Decomposition
        </span>
        <span id={`${id}-description`} className="text-[13px] leading-5 text-muted-foreground">
          How the Decomposer applies the subtasks and links it proposes.
        </span>
      </div>
      <RadioGroup
        value={mode}
        onValueChange={choose}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        className="grid-cols-1 gap-2 sm:grid-cols-2"
      >
        {DECOMPOSITION_MODES.map((option) => (
          <label
            key={option}
            htmlFor={`${id}-${option}`}
            className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border px-3 py-2.5 hover:bg-accent/40 has-[[data-state=checked]]:border-brand/70 has-[[data-state=checked]]:bg-brand-soft/60 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/40"
          >
            <RadioGroupItem
              id={`${id}-${option}`}
              value={option}
              aria-describedby={`${id}-${option}-description`}
              className="mt-0.5 text-brand data-[state=checked]:border-brand [&_svg]:fill-brand"
            />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[13px] font-medium text-foreground">
                {MODE_OPTIONS[option].label}
              </span>
              <span
                id={`${id}-${option}-description`}
                className="text-[12.5px] leading-[18px] text-muted-foreground"
              >
                {MODE_OPTIONS[option].description}
              </span>
            </span>
          </label>
        ))}
      </RadioGroup>
      <AutoModeDialog
        open={confirming}
        onOpenChange={setConfirming}
        onConfirm={() => {
          setConfirming(false);
          void save('auto');
        }}
      />
    </div>
  );
}
