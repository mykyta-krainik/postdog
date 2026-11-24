import type { ReactNode } from 'react';
import { Skeleton } from '@/shared/ui/skeleton';
import { LogoMark } from '@/shared/ui/wordmark';

const SKELETON_WIDTHS = ['w-2/3', 'w-1/2', 'w-3/4', 'w-2/5', 'w-3/5', 'w-1/2', 'w-2/3'];

export function TaskListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading tasks" className="min-h-0 flex-1 overflow-hidden">
      <div className="flex h-9 items-center gap-2 border-b border-border/60 bg-muted/40 px-4 md:px-5">
        <Skeleton className="h-3 w-24" />
      </div>
      {SKELETON_WIDTHS.map((width, index) => (
        <div
          key={index}
          className="flex h-11 items-center gap-3 border-b border-border/60 px-4 md:h-9 md:px-5"
        >
          <Skeleton className="size-3.5" />
          <Skeleton className="h-3 w-10" />
          <Skeleton className="size-3.5 rounded-full" />
          <Skeleton className={`h-3 ${width}`} />
        </div>
      ))}
    </div>
  );
}

/** A centred message for an empty or failed list, with one action. */
export function ListMessage({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <LogoMark className="size-9 opacity-90" />
      <div className="flex max-w-sm flex-col gap-1">
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
        <p className="text-[13px] text-muted-foreground">{children}</p>
      </div>
      {action}
    </div>
  );
}
