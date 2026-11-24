'use client';

import type { Suggestion } from '@postdog/shared';
import Link from 'next/link';
import {
  StatusIcon,
  useTaskListParams,
  useTasks,
  type TaskDetail,
  type TaskListItem,
} from '@/entities/task';
import { Skeleton } from '@/shared/ui/skeleton';
import { relatedPlan } from '../model/related';
import { useReview } from '../model/use-review';
import { ReviewActions } from './review-actions';

type RelatedSuggestion = Extract<Suggestion, { kind: 'related' }>;
type GroupRow = Pick<
  TaskListItem,
  'id' | 'identifier' | 'title' | 'status' | 'createdAt' | 'updatedAt'
>;

/**
 * The group's tasks. The viewed task comes from its detail, the others from the top-level task
 * list, since the Decomposer groups top-level tasks only. A task missing from both is undefined.
 */
function useGroupTasks(ids: readonly number[], viewed: GroupRow): (GroupRow | undefined)[] {
  const { data } = useTasks();
  return ids.map((id) => (id === viewed.id ? viewed : data?.items.find((task) => task.id === id)));
}

/**
 * Two or more tasks that describe the same work, or share part of it. Accept links them: a
 * duplicates link from each newer task to the oldest, or relates links. It shows on every task
 * of the group, and the accept is checked against the group's target task.
 */
export function RelatedReview({
  suggestion,
  task,
}: {
  suggestion: RelatedSuggestion;
  task: TaskDetail;
}) {
  const { hrefWith } = useTaskListParams();
  const { relation, taskIds, reason } = suggestion.payload;
  const group = useGroupTasks(taskIds, task);
  const loaded = group.filter((row): row is GroupRow => row !== undefined);
  const target = group[taskIds.indexOf(suggestion.targetId)];
  const plan = relatedPlan(relation, loaded);
  const review = useReview(suggestion.id, target?.identifier ?? `Task #${suggestion.targetId}`);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] leading-relaxed text-muted-foreground">{reason}</p>
      <ul aria-label="Tasks in this group" className="-mx-1.5 flex flex-col">
        {taskIds.map((id, index) => {
          const row = group[index];
          return (
            <li key={id}>
              <Link
                href={hrefWith({ selectedTaskId: id })}
                scroll={false}
                aria-current={id === task.id ? 'page' : undefined}
                className="flex h-10 min-w-0 items-center gap-2 rounded-md px-1.5 text-[13px] outline-none hover:bg-accent/50 focus-visible:ring-1 focus-visible:ring-ring md:h-8"
              >
                {row ? (
                  <>
                    <StatusIcon status={row.status} />
                    <span className="min-w-11 shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                      {row.identifier}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{row.title}</span>
                    {id === task.id && (
                      <span className="shrink-0 text-xs text-muted-foreground">This task</span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="shrink-0 text-xs text-muted-foreground">Task #{id}</span>
                    <Skeleton className="h-3 w-32" />
                  </>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
      <ReviewActions
        review={review}
        acceptLabel={plan.accept}
        acceptDisabled={target === undefined}
        onAccept={() => {
          if (target) review.accept({ baseUpdatedAt: target.updatedAt }, plan.done);
        }}
        hint={plan.explanation}
      />
    </div>
  );
}
