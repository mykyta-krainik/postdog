import type { PlannerRun } from '@postdog/shared';
import { TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { routes } from '@/shared/config';
import { Button } from '@/shared/ui/button';

/** A finished plan, compact: each focus task with its reason, linking to the task, and Open Today. */
export function PlannerResult({ run }: { run: PlannerRun }) {
  const output = run.output;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {output && output.warnings.length > 0 && (
        <div className="flex gap-2.5 rounded-md border border-brand/35 bg-brand-soft/60 px-3 py-2.5">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
          <ul className="flex min-w-0 flex-col gap-0.5 text-[13px]">
            {output.warnings.map((warning, index) => (
              <li key={index} className="wrap-anywhere">
                {warning.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {output ? (
        <ol aria-label="The plan" className="-mx-1.5 flex flex-col">
          {output.focus.map((item, index) => (
            <li key={item.taskId}>
              <Link
                href={routes.task(item.taskId)}
                className="flex min-h-10 min-w-0 items-start gap-2.5 rounded-md px-1.5 py-2 text-[13px] outline-none hover:bg-accent/50 focus-visible:ring-1 focus-visible:ring-ring md:py-1.5"
              >
                <span className="w-4 shrink-0 text-xs text-muted-foreground tabular-nums">
                  {index + 1}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {item.identifier}
                    </span>
                    <span className="min-w-0 truncate font-medium">{item.title}</span>
                  </span>
                  <span className="text-xs text-muted-foreground wrap-anywhere">{item.reason}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-[13px] text-muted-foreground">The run finished without a plan.</p>
      )}
      <Button asChild size="sm" className="h-10 self-start px-3 text-[13px] md:h-8">
        <Link href={routes.today}>Open Today</Link>
      </Button>
    </div>
  );
}
