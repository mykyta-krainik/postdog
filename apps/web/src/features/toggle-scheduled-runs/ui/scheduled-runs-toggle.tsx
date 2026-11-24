'use client';

import { SCHEDULED_RUNS, type ScheduledAgent } from '@postdog/shared';
import { useId } from 'react';
import { toast } from 'sonner';
import { updateSettings } from '@/entities/settings';
import { cn } from '@/shared/lib/utils';
import { Switch } from '@/shared/ui/switch';

/** "8:00", from the API's schedule, so the text follows a change of SCHEDULED_RUNS. */
function timeOf(agent: ScheduledAgent): string {
  const slot = SCHEDULED_RUNS.find((run) => run.agent === agent);
  return slot ? `${slot.hour}:${String(slot.minute).padStart(2, '0')}` : '';
}

/**
 * The daily Planner and Status updater runs. It renders while AI is off too, disabled, and says
 * that nothing runs until AI is back on.
 */
export function ScheduledRunsToggle({
  enabled,
  aiEnabled,
}: {
  enabled: boolean;
  aiEnabled: boolean;
}) {
  const id = useId();

  async function change(next: boolean) {
    try {
      await updateSettings({ scheduledRunsEnabled: next });
    } catch (error) {
      toast.error(next ? 'Daily runs are still off' : 'Daily runs are still on', {
        description: error instanceof Error ? error.message : 'The API rejected the change.',
      });
    }
  }

  return (
    <label
      htmlFor={`${id}-switch`}
      className={cn(
        'flex items-start gap-4 px-4 py-3.5',
        aiEnabled ? 'cursor-pointer hover:bg-accent/40' : 'cursor-not-allowed',
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span id={`${id}-title`} className="text-[13px] font-medium text-foreground">
          Daily runs
        </span>
        <span id={`${id}-description`} className="text-[13px] leading-5 text-muted-foreground">
          Plans your day at {timeOf('planner')} and writes your status update at{' '}
          {timeOf('status_updater')}, in the server&apos;s time zone. You can still run both
          yourself any time.
          {!aiEnabled && (
            <span className="mt-1 block text-foreground/80">Nothing runs while AI is off.</span>
          )}
        </span>
      </span>
      <Switch
        id={`${id}-switch`}
        checked={enabled}
        disabled={!aiEnabled}
        onCheckedChange={(next) => void change(next)}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        className="mt-0.5 data-[state=checked]:bg-brand"
      />
    </label>
  );
}
