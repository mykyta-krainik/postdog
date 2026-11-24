'use client';

import { LoaderCircle, RotateCw, Sparkles } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { usePlanDay } from '@/features/plan-day';
import {
  AgentRunStatus,
  MockAiBadge,
  findRunning,
  isRunBusy,
  usePlannerLatest,
  useRunningRuns,
} from '@/entities/agent-run';
import { ApiError } from '@/shared/api';
import { routes } from '@/shared/config';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { LogoMark } from '@/shared/ui/wordmark';
import { PlanView } from './plan-view';

function Message({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <LogoMark className="size-9 opacity-90" />
      <div className="flex max-w-sm flex-col gap-1">
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
        <p className="text-[13px] text-muted-foreground">{children}</p>
      </div>
      {action}
    </div>
  );
}

function PlanSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading today's plan" className="flex flex-col">
      <div className="flex h-10 items-center border-b border-border px-4 md:px-5">
        <Skeleton className="h-3 w-40" />
      </div>
      {['w-3/5', 'w-1/2', 'w-2/3'].map((width) => (
        <div key={width} className="flex gap-4 border-b border-border/60 px-4 py-3 md:px-5">
          <Skeleton className="size-4" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className={`h-3.5 ${width}`} />
            <Skeleton className="h-3 w-11/12" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The Today page body: the Planner's latest plan with its warnings, a staleness hint and the
 * trace, Refresh to plan again, and the run's progress while it plans. A Planner run started
 * elsewhere, in another tab or before the user left, disables planning and links to the run;
 * its plan shows once it finishes. Mount it only while AI is on.
 */
export function TodayFocus() {
  const { latest, error, isValidating, mutate } = usePlannerLatest();
  const runner = usePlanDay();
  const { runs } = useRunningRuns();
  const busy = isRunBusy(runner.view);
  const ownRunId = 'run' in runner.view ? runner.view.run.id : undefined;
  const elsewhere = busy ? undefined : findRunning(runs, { agent: 'planner' }, ownRunId);

  const planButton = (label: string, variant: 'default' | 'outline') => {
    if (elsewhere) {
      return (
        <div className="flex items-center gap-2">
          <Link
            href={routes.run(elsewhere.id)}
            className="flex h-10 items-center rounded-md px-1.5 text-[13px] text-brand-text underline-offset-2 outline-none hover:underline focus-visible:ring-1 focus-visible:ring-ring md:h-8"
          >
            Watch the run
          </Link>
          <Button variant={variant} className="h-10 gap-1.5 px-3 text-[13px] md:h-8" disabled>
            <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
            Planning your day…
          </Button>
        </div>
      );
    }
    return (
      <Button
        variant={variant}
        className="h-10 gap-1.5 px-3 text-[13px] md:h-8"
        disabled={busy}
        onClick={runner.start}
      >
        {busy ? (
          <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
        ) : label === 'Refresh' ? (
          <RotateCw className="size-4" aria-hidden />
        ) : (
          <Sparkles className="size-4" aria-hidden />
        )}
        {busy ? 'Planning…' : label}
      </Button>
    );
  };

  const body = (() => {
    if (latest === undefined) {
      if (!error) return <PlanSkeleton />;
      const unreachable = error instanceof ApiError && error.code === 'network_error';
      return (
        <Message
          title="Today's plan didn't load"
          action={
            <Button
              variant="outline"
              size="sm"
              className="h-10 md:h-8"
              disabled={isValidating}
              onClick={() => void mutate()}
            >
              {isValidating ? 'Trying again…' : 'Try again'}
            </Button>
          }
        >
          {unreachable
            ? "Postdog can't reach the API. Check that it is running, then try again."
            : error instanceof Error
              ? error.message
              : 'The API returned an error.'}
        </Message>
      );
    }
    if (latest === null) {
      return (
        <Message title="Nothing planned yet" action={!busy && planButton('Plan my day', 'default')}>
          Ask Postdog what to start with.
        </Message>
      );
    }
    return (
      <PlanView
        key={latest.run.id}
        run={latest.run}
        changedSince={latest.changedSince}
        onRefresh={runner.start}
      />
    );
  })();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 md:px-5">
        <div className="flex h-8 min-w-0 items-center gap-2">
          <h1 className="text-[15px] font-semibold tracking-[-0.01em]">Today</h1>
          <MockAiBadge aiEnabled />
        </div>
        {latest && planButton('Refresh', 'outline')}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="flex w-full max-w-[820px] flex-col gap-3 pt-3">
          {runner.view.status !== 'completed' && runner.view.status !== 'idle' && (
            <AgentRunStatus
              view={runner.view}
              agent="planner"
              onCancel={runner.cancel}
              onRetry={runner.start}
              className="mx-4 md:mx-5"
            />
          )}
          {body}
        </div>
      </div>
    </div>
  );
}
