import type { RelatedPayload, TaskListItem } from '@postdog/shared';

/** What the review needs of each task in a group. */
export type GroupTask = Pick<TaskListItem, 'id' | 'identifier' | 'createdAt'>;

export type RelatedPlan = { accept: string; explanation: string; done: string };

function names(tasks: readonly GroupTask[]): string {
  const ids = tasks.map((task) => task.identifier);
  return ids.length <= 1 ? (ids[0] ?? '') : `${ids.slice(0, -1).join(', ')} and ${ids.at(-1)}`;
}

/**
 * What accepting a related suggestion does, in words. Duplicates link each newer task to the
 * oldest one; overlaps only add relates links. `tasks` are the group's tasks in any order;
 * unloaded ones are left out, so the plan names what it can.
 */
export function relatedPlan(
  relation: RelatedPayload['relation'],
  tasks: readonly GroupTask[],
): RelatedPlan {
  if (relation === 'overlaps') {
    return {
      accept: 'Link them',
      explanation: 'Adds a relates link between these tasks. Nothing else changes.',
      done: `Linked ${names(tasks)}`,
    };
  }
  const [oldest, ...newer] = [...tasks].sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);
  if (!oldest || newer.length === 0) {
    return {
      accept: 'Mark as duplicate',
      explanation: 'The newer task is marked a duplicate of the older one.',
      done: 'Marked as duplicate',
    };
  }
  const several = newer.length > 1;
  return {
    accept: 'Mark as duplicate',
    explanation: `${names(newer)} ${several ? 'are' : 'is'} marked ${several ? 'duplicates' : 'a duplicate'} of ${oldest.identifier}, the ${several ? 'oldest' : 'older'} task. Nothing is deleted.`,
    done: `Marked ${names(newer)} ${several ? 'as duplicates' : 'as a duplicate'} of ${oldest.identifier}`,
  };
}
