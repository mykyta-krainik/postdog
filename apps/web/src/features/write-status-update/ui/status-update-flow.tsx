'use client';

import { CircleSlash, RotateCw } from 'lucide-react';
import { AgentRunStatus, TraceTimeline } from '@/entities/agent-run';
import { Button } from '@/shared/ui/button';
import type { StatusUpdater } from '../model/use-status-update';
import { NotesRequest } from './notes-request';
import { UpdateResult } from './update-result';

/** Every state of one status update: progress and Cancel, the draft, the request for notes, or what failed. */
export function StatusUpdateFlow({ updater }: { updater: StatusUpdater }) {
  const { view } = updater;

  switch (view.kind) {
    case 'idle':
      return null;
    case 'run_state':
      return (
        <AgentRunStatus
          view={view.view}
          agent="status_updater"
          onCancel={updater.cancel}
          onRetry={updater.retry}
        />
      );
    case 'update':
      return (
        <div className="flex min-w-0 flex-col gap-3">
          <UpdateResult
            key={view.run.id}
            run={view.run}
            output={view.output}
            drafts={updater}
            onRegenerate={updater.run}
          />
          <TraceTimeline trace={view.run.trace} />
        </div>
      );
    case 'needs_notes':
      return (
        <div className="flex min-w-0 flex-col gap-3">
          <NotesRequest key={view.run.id} run={view.run} output={view.output} updater={updater} />
          <TraceTimeline trace={view.run.trace} />
        </div>
      );
    case 'empty':
      return (
        <div className="flex min-w-0 flex-col gap-1.5">
          <div
            role="status"
            className="flex items-start gap-3 rounded-md border border-border bg-muted/40 px-3 py-2.5"
          >
            <CircleSlash className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="text-[13px] font-medium">The run finished without a draft</p>
              <p className="text-[13px] text-muted-foreground">
                The API sent back no update. Run it again, or check the trace below.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-10 shrink-0 gap-1.5 px-3 text-[13px] md:h-8"
              onClick={updater.retry}
            >
              <RotateCw className="size-3.5" aria-hidden />
              Retry
            </Button>
          </div>
          <TraceTimeline trace={view.run.trace} />
        </div>
      );
  }
}
