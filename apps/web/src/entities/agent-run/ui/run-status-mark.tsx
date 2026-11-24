import type { RunStatus } from '@postdog/shared';
import {
  CircleCheck,
  CircleSlash,
  LoaderCircle,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { RUN_STATUS_LABEL } from '../model/run-summary';

const STATUS_ICON: Record<RunStatus, { icon: LucideIcon; className: string }> = {
  running: { icon: LoaderCircle, className: 'animate-spin text-brand motion-reduce:animate-none' },
  completed: { icon: CircleCheck, className: 'text-status-done' },
  failed: { icon: TriangleAlert, className: 'text-destructive' },
  cancelled: { icon: CircleSlash, className: 'text-muted-foreground' },
};

/** A run's status as an icon with its name for screen readers: a spinner while it runs. */
export function RunStatusMark({ status, className }: { status: RunStatus; className?: string }) {
  const { icon: Icon, className: tone } = STATUS_ICON[status];
  return (
    <Icon
      role="img"
      aria-label={RUN_STATUS_LABEL[status]}
      className={cn('size-4 shrink-0', tone, className)}
    />
  );
}
