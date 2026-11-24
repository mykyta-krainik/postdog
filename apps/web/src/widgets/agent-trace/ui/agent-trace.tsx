'use client';

import {
  AGENT_META,
  MockAiBadgeView,
  RUN_STATUS_LABEL,
  TraceTimeline,
  useAgentRun,
} from '@/entities/agent-run';
import { formatDayTime } from '@/shared/lib/format';
import { Skeleton } from '@/shared/ui/skeleton';

/**
 * One run's trace, loaded by id and polled while it runs: the agent, its status and model layer,
 * then the collapsible timeline. For places that show the latest agent trace, such as task detail.
 */
export function AgentTrace({
  runId,
  defaultOpen = false,
}: {
  runId: number;
  defaultOpen?: boolean;
}) {
  const { data: run, error } = useAgentRun(runId);

  if (!run) {
    if (error) {
      return (
        <p className="text-xs text-muted-foreground">The trace of run #{runId} didn't load.</p>
      );
    }
    return <Skeleton aria-label="Loading trace" className="h-8 w-full" />;
  }

  return (
    <section
      aria-label={`${AGENT_META[run.agent].label} run #${run.id}`}
      className="flex flex-col gap-1"
    >
      <div className="flex flex-wrap items-center gap-2 px-1.5 text-xs text-muted-foreground">
        <span className="font-medium text-foreground/80">{AGENT_META[run.agent].label}</span>
        <span>{RUN_STATUS_LABEL[run.status]}</span>
        <time dateTime={new Date(run.startedAt).toISOString()} className="tabular-nums">
          {formatDayTime(run.startedAt)}
        </time>
        <MockAiBadgeView llm={run.llm} />
      </div>
      <TraceTimeline trace={run.trace} title="Trace" defaultOpen={defaultOpen} />
    </section>
  );
}
