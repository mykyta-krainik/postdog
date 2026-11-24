import type { TaskStatus } from '@postdog/shared';
import { cn } from '@/shared/lib/utils';

function TodoGlyph() {
  return <circle cx="7" cy="7" r="5.75" fill="none" stroke="currentColor" strokeWidth="1.5" />;
}

function InProgressGlyph() {
  return (
    <>
      <circle cx="7" cy="7" r="5.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 3.5a3.5 3.5 0 0 1 0 7Z" fill="currentColor" />
    </>
  );
}

function DoneGlyph() {
  return (
    <>
      <circle cx="7" cy="7" r="6.5" fill="currentColor" />
      <path
        d="m4.4 7.1 1.8 1.8 3.5-3.6"
        fill="none"
        stroke="var(--background)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

/** Label, colour and glyph of each status. Every status UI reads this table. */
export const TASK_STATUS_META: Record<
  TaskStatus,
  { label: string; className: string; Glyph: () => React.JSX.Element }
> = {
  todo: { label: 'Todo', className: 'text-status-todo', Glyph: TodoGlyph },
  in_progress: {
    label: 'In progress',
    className: 'text-status-in-progress',
    Glyph: InProgressGlyph,
  },
  done: { label: 'Done', className: 'text-status-done', Glyph: DoneGlyph },
};

export function StatusIcon({ status, className }: { status: TaskStatus; className?: string }) {
  const { label, className: tone, Glyph } = TASK_STATUS_META[status];
  return (
    <svg
      viewBox="0 0 14 14"
      role="img"
      aria-label={label}
      className={cn('size-3.5 shrink-0', tone, className)}
    >
      <Glyph />
    </svg>
  );
}
