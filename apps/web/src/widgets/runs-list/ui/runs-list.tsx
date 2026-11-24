'use client';

import type { AgentRunSummary } from '@postdog/shared';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import {
  AGENT_META,
  MockAiBadgeView,
  RunStatusMark,
  ScheduledBadge,
  runTimingText,
  runTitle,
  useAgentRuns,
} from '@/entities/agent-run';
import { routes } from '@/shared/config';
import { cn } from '@/shared/lib/utils';
import { LoadError } from '@/shared/ui/load-error';
import { Skeleton } from '@/shared/ui/skeleton';
import { LogoMark } from '@/shared/ui/wordmark';
import { RunDetail } from './run-detail';

/** How many recent runs the page lists. */
export const RUNS_LIMIT = 30;

const detailId = (runId: number) => `run-${runId}-detail`;
const rowId = (runId: number) => `run-${runId}`;

function RunRow({ run, open }: { run: AgentRunSummary; open: boolean }) {
  return (
    <li id={rowId(run.id)} className="border-b border-border/70">
      <Link
        href={open ? routes.runs : routes.run(run.id)}
        scroll={false}
        aria-expanded={open}
        aria-controls={open ? detailId(run.id) : undefined}
        className={cn(
          'flex min-h-14 min-w-0 items-center gap-3 px-4 py-2.5 outline-none hover:bg-accent/50 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset md:px-5',
          open && 'bg-accent/40',
        )}
      >
        <RunStatusMark status={run.status} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 truncate text-[13px] font-medium">{runTitle(run)}</span>
            <ScheduledBadge trigger={run.trigger} />
            <MockAiBadgeView llm={run.llm} />
          </span>
          <span className="flex min-w-0 flex-wrap gap-x-2 text-xs text-muted-foreground">
            <span className="text-foreground/80">{AGENT_META[run.agent].label}</span>
            <span>{runTimingText(run)}</span>
          </span>
        </span>
        <ChevronRight
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform duration-150',
            open && 'rotate-90',
          )}
          aria-hidden
        />
      </Link>
      {open && (
        <div id={detailId(run.id)} className="px-4 pt-1 pb-4 md:pr-5 md:pl-12">
          <RunDetail runId={run.id} />
        </div>
      )}
    </li>
  );
}

function ListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading runs" className="flex flex-col">
      {['w-2/5', 'w-1/2', 'w-1/3'].map((width) => (
        <div
          key={width}
          className="flex items-center gap-3 border-b border-border/70 px-4 py-3 md:px-5"
        >
          <Skeleton className="size-4 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className={`h-3.5 ${width}`} />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Empty() {
  const link = 'text-brand-text underline underline-offset-2';
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <LogoMark className="size-9 opacity-90" />
      <div className="flex max-w-sm flex-col gap-1">
        <h2 className="text-sm font-medium">No runs yet</h2>
        <p className="text-[13px] text-muted-foreground">
          <Link href={routes.today} className={link}>
            Plan your day
          </Link>
          , or{' '}
          <Link href={routes.tasks} className={link}>
            decompose some tasks
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

/**
 * The recent agent runs, newest first, polled while one of them runs. A row opens in place to
 * show the run: progress with Cancel, its result, or what failed, and the trace. `openRunId`
 * comes from the URL, so a link can open a run; a run that is not in the list opens above it.
 */
export function RunsList({ openRunId }: { openRunId: number | undefined }) {
  const { data, error, isLoading, mutate } = useAgentRuns({ limit: RUNS_LIMIT });
  const runs = data?.items;
  const loaded = runs !== undefined;
  const listed = openRunId !== undefined && runs?.some((run) => run.id === openRunId);

  // A deep link opens a run further down the list: bring it into view once the list is there.
  useEffect(() => {
    if (openRunId === undefined || !loaded) return;
    document.getElementById(rowId(openRunId))?.scrollIntoView({ block: 'nearest' });
  }, [openRunId, loaded]);

  if (!runs) {
    if (error) {
      return (
        <LoadError
          title="Runs didn't load"
          error={error}
          retrying={isLoading}
          onRetry={() => void mutate()}
          className="m-4 md:m-5"
        />
      );
    }
    return <ListSkeleton />;
  }

  return (
    <div className="flex flex-col">
      {openRunId !== undefined && !listed && (
        <section
          aria-label={`Run #${openRunId}`}
          className="border-b border-border px-4 py-4 md:px-5"
        >
          <RunDetail runId={openRunId} />
        </section>
      )}
      {runs.length === 0 ? (
        <Empty />
      ) : (
        <ul aria-label="Recent runs" className="flex flex-col">
          {runs.map((run) => (
            <RunRow key={run.id} run={run} open={run.id === openRunId} />
          ))}
        </ul>
      )}
    </div>
  );
}
