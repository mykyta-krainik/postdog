import type { TaskListItem } from '@postdog/shared';
import { Link2, ListChecks } from 'lucide-react';
import Link from 'next/link';
import { formatDateTime, formatShortDate } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { AiDot } from './ai-dot';
import { PriorityIcon } from './priority-icon';
import { StatusIcon } from './status-icon';

type TaskRowProps = {
  task: TaskListItem;
  href: string;
  selected?: boolean;
  aiEnabled: boolean;
};

/** One line per task. Subtask progress, links and the date hide below md. */
export function TaskRow({ task, href, selected = false, aiEnabled }: TaskRowProps) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={selected ? 'true' : undefined}
      data-task-id={task.id}
      className={cn(
        'group flex h-11 items-center gap-3 border-b border-border/60 px-4 text-[13px] outline-none md:h-9 md:px-5',
        'hover:bg-accent/50 focus-visible:bg-accent/70 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset',
        selected && 'bg-accent/80 hover:bg-accent/80',
      )}
    >
      <PriorityIcon priority={task.priority} />
      <span className="w-12 shrink-0 text-muted-foreground tabular-nums">{task.identifier}</span>
      <StatusIcon status={task.status} />
      <span className="min-w-0 flex-1 truncate text-foreground">{task.title}</span>
      <AiDot aiState={task.aiState} aiEnabled={aiEnabled} />
      <span className="hidden shrink-0 items-center gap-3 text-xs text-muted-foreground md:flex">
        {task.subtaskCount > 0 && (
          <span
            className="flex items-center gap-1 tabular-nums"
            title={`${task.subtaskDoneCount} of ${task.subtaskCount} subtasks done`}
          >
            <ListChecks className="size-3.5" aria-hidden />
            {task.subtaskDoneCount}/{task.subtaskCount}
          </span>
        )}
        {task.linkCount > 0 && (
          <span
            className="flex items-center gap-1 tabular-nums"
            title={`${task.linkCount} linked ${task.linkCount === 1 ? 'task' : 'tasks'}`}
          >
            <Link2 className="size-3.5" aria-hidden />
            {task.linkCount}
          </span>
        )}
        <time
          dateTime={new Date(task.createdAt).toISOString()}
          title={`Created ${formatDateTime(task.createdAt)}`}
          className="w-14 text-right tabular-nums"
        >
          {formatShortDate(task.createdAt)}
        </time>
      </span>
    </Link>
  );
}
