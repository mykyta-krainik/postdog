'use client';

import type { DecomposerOutcome, DecomposerRun } from '@postdog/shared';
import {
  Ban,
  CircleCheck,
  CircleSlash,
  Inbox,
  Link2,
  Copy,
  Hourglass,
  ListTree,
  MessageCircleQuestionMark,
  PencilLine,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useTaskListParams } from '@/entities/task';
import { routes } from '@/shared/config';
import { OUTCOME_LABEL, relatedGroupText, summaryLine } from '../model/result';

const OUTCOME_ICON: Record<DecomposerOutcome, { icon: LucideIcon; className: string }> = {
  suggested_subtasks: { icon: ListTree, className: 'text-brand' },
  applied_subtasks: { icon: CircleCheck, className: 'text-status-done' },
  needs_clarification: { icon: MessageCircleQuestionMark, className: 'text-brand' },
  skipped: { icon: CircleSlash, className: 'text-muted-foreground' },
  duplicate: { icon: Copy, className: 'text-muted-foreground' },
  claimed: { icon: Hourglass, className: 'text-muted-foreground' },
  superseded: { icon: PencilLine, className: 'text-muted-foreground' },
  failed: { icon: Ban, className: 'text-destructive' },
};

/**
 * A completed Decomposer run: the counts in one line, one row per task that opens it for
 * review, the related groups, then the warnings. An auto run that changed something links to the
 * Inbox, where it can be undone. `onOpenTask` closes a dialog so the task panel or Inbox shows.
 */
export function DecomposeResult({
  run,
  onOpenTask,
}: {
  run: DecomposerRun;
  onOpenTask?: () => void;
}) {
  const { hrefWith } = useTaskListParams();
  const output = run.output;
  const summary = output && summaryLine(output);

  if (!output || !summary) {
    return (
      <div
        role="status"
        className="flex flex-col gap-1 rounded-md border border-border bg-muted/40 px-3 py-2.5"
      >
        <p className="text-[13px] font-medium">Nothing to split right now</p>
        <p className="text-[13px] text-muted-foreground">
          Postdog looks at top-level to-do tasks with no subtasks and nothing waiting for review.
          Add a few, or come back after you have reviewed the open suggestions.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p role="status" className="text-[13px] font-medium">
        {summary}
      </p>
      {output.changesetId !== null && (
        <Link
          href={routes.inbox}
          onClick={onOpenTask}
          className="-mt-1 flex min-h-10 items-center gap-1.5 self-start rounded-md text-[13px] text-brand-text underline-offset-2 outline-none hover:underline focus-visible:ring-1 focus-visible:ring-ring md:min-h-6"
        >
          <Inbox className="size-3.5" aria-hidden />
          Review in Inbox
        </Link>
      )}
      <ul aria-label="Tasks the Decomposer looked at" className="-mx-1.5 flex flex-col">
        {output.tasks.map((row) => {
          const { icon: Icon, className } = OUTCOME_ICON[row.outcome];
          return (
            <li key={row.taskId}>
              <Link
                href={hrefWith({ selectedTaskId: row.taskId })}
                scroll={false}
                onClick={onOpenTask}
                className="flex min-h-10 min-w-0 items-start gap-2.5 rounded-md px-1.5 py-2 text-[13px] outline-none hover:bg-accent/50 focus-visible:ring-1 focus-visible:ring-ring md:min-h-8 md:py-1.5"
              >
                <Icon
                  role="img"
                  aria-label={OUTCOME_LABEL[row.outcome]}
                  className={`mt-0.5 size-3.5 shrink-0 ${className}`}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {row.identifier}
                    </span>
                    <span className="min-w-0 truncate">{row.title}</span>
                  </span>
                  <span className="text-xs text-muted-foreground wrap-anywhere">{row.detail}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {output.related.length > 0 && (
        <ul aria-label="Related tasks" className="flex flex-col gap-1.5">
          {output.related.map((group) => {
            const { names, status } = relatedGroupText(group, output.tasks);
            return (
              <li key={group.suggestionId} className="flex min-w-0 items-start gap-2.5 text-[13px]">
                <Link2
                  aria-hidden
                  className={`mt-0.5 size-3.5 shrink-0 ${group.applied ? 'text-status-done' : 'text-brand'}`}
                />
                <span className="min-w-0 wrap-anywhere">
                  <span className="font-medium">{status}</span>{' '}
                  <span className="text-muted-foreground">{names}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {output.warnings.length > 0 && (
        <div className="flex gap-2.5 rounded-md border border-brand/35 bg-brand-soft/60 px-3 py-2.5">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-[13px] font-medium">
              Postdog dropped{' '}
              {output.warnings.length === 1 ? 'one item' : `${output.warnings.length} items`} that
              failed its checks
            </p>
            <ul className="flex flex-col gap-0.5 text-[13px] text-muted-foreground">
              {output.warnings.map((warning, index) => (
                <li key={index} className="wrap-anywhere">
                  {warning.message}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
