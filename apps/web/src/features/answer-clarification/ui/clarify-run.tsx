'use client';

import { CircleCheck } from 'lucide-react';
import { AgentRunStatus } from '@/entities/agent-run';
import { Button } from '@/shared/ui/button';
import type { Clarifier } from '../model/use-clarify';

/**
 * The run that answers a clarification: progress and Cancel, what failed with Retry and the
 * trace, or a short note once it is done. The new suggestion itself shows in the panel.
 */
export function ClarifyRun({ clarifier }: { clarifier: Clarifier }) {
  return (
    <AgentRunStatus
      view={clarifier.view}
      agent="decomposer"
      onCancel={clarifier.cancel}
      onRetry={clarifier.start}
      result={(run) => (
        <div
          role="status"
          className="flex items-start gap-3 rounded-md border border-border bg-muted/40 px-3 py-2.5"
        >
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-status-done" aria-hidden />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="text-[13px] font-medium">Thanks, Postdog took another look</p>
            <p className="text-[13px] text-muted-foreground">
              {run.output?.tasks[0]?.detail ?? 'Anything new to review shows here.'}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-10 shrink-0 px-3 text-[13px] md:h-8"
            onClick={clarifier.reset}
          >
            Dismiss
          </Button>
        </div>
      )}
    />
  );
}
