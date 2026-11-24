'use client';

import type { TraceStep, TraceStepType } from '@postdog/shared';
import { ChevronRight, ShieldCheck, Sparkles, Wrench, type LucideIcon } from 'lucide-react';
import { formatCompactNumber, formatDuration } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible';
import { describeStep, summarizeTrace } from '../model/trace';

const STEP_ICON: Record<TraceStepType, { icon: LucideIcon; label: string; className: string }> = {
  llm: { icon: Sparkles, label: 'Model call', className: 'text-brand' },
  tool: { icon: Wrench, label: 'Tool call', className: 'text-muted-foreground' },
  validation: { icon: ShieldCheck, label: 'Validation', className: 'text-status-done' },
};

function totals(trace: readonly TraceStep[]) {
  let durationMs = 0;
  let tokens = 0;
  for (const step of trace) {
    durationMs += step.durationMs;
    tokens += (step.tokens?.input ?? 0) + (step.tokens?.output ?? 0);
  }
  return { durationMs, tokens };
}

function StepRow({ step }: { step: TraceStep }) {
  const { icon: Icon, label, className } = STEP_ICON[step.type];
  const tokens = step.tokens ? step.tokens.input + step.tokens.output : undefined;
  return (
    <li className="relative flex gap-3 py-1.5 pl-1">
      <span className="flex w-5 shrink-0 justify-end pt-px text-xs text-muted-foreground tabular-nums">
        {step.step}
      </span>
      <Icon role="img" aria-label={label} className={cn('mt-0.5 size-3.5 shrink-0', className)} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
            {describeStep(step).done}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {formatDuration(step.durationMs)}
            {tokens !== undefined && (
              <span className="ml-2">{formatCompactNumber(tokens)} tok</span>
            )}
          </span>
        </div>
        {step.input && (
          <p className="truncate text-xs text-muted-foreground" title={step.input}>
            {step.tool && <span className="text-foreground/70">{step.tool} </span>}
            {step.input}
          </p>
        )}
        {step.outputSummary && (
          <p className="line-clamp-2 text-xs text-muted-foreground" title={step.outputSummary}>
            {step.outputSummary}
          </p>
        )}
      </div>
    </li>
  );
}

/**
 * A run's trace as a collapsible timeline. Closed, it reads as one line, such as
 * "Looked at PD-12, searched tasks for 'auth', proposed 4 focus tasks".
 */
export function TraceTimeline({
  trace,
  title = 'How Postdog got here',
  defaultOpen = false,
  className,
}: {
  trace: readonly TraceStep[];
  title?: string;
  defaultOpen?: boolean;
  className?: string;
}) {
  const { durationMs, tokens } = totals(trace);
  const summary = summarizeTrace(trace);

  return (
    <Collapsible defaultOpen={defaultOpen} className={cn('group/trace min-w-0', className)}>
      <CollapsibleTrigger className="flex min-h-10 w-full min-w-0 items-center gap-2 rounded-md px-1.5 text-left text-xs text-muted-foreground outline-none hover:bg-accent/50 hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring md:min-h-8">
        <ChevronRight
          className="size-3.5 shrink-0 transition-transform duration-150 group-data-[state=open]/trace:rotate-90"
          aria-hidden
        />
        <span className="shrink-0 font-medium text-foreground/80">{title}</span>
        <span className="min-w-0 flex-1 truncate max-md:hidden">{summary}</span>
        <span className="ml-auto shrink-0 tabular-nums">
          {trace.length} {trace.length === 1 ? 'step' : 'steps'}
          <span className="ml-2">{formatDuration(durationMs)}</span>
          {tokens > 0 && (
            <span className="ml-2 max-md:hidden">{formatCompactNumber(tokens)} tok</span>
          )}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {trace.length === 0 ? (
          <p className="px-8 py-2 text-xs text-muted-foreground">No steps were recorded.</p>
        ) : (
          <ol aria-label="Trace steps" className="mt-1 flex flex-col pl-1">
            {trace.map((step) => (
              <StepRow key={step.step} step={step} />
            ))}
          </ol>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
