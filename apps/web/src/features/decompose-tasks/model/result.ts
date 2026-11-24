import type { DecomposerOutcome, DecomposerOutput } from '@postdog/shared';

function plural(count: number, word: string, many = `${word}s`): string {
  return `${count} ${count === 1 ? word : many}`;
}

type Counts = DecomposerOutput['counts'];

/** The parts before the questions, in the order the user reads them. Zero counts are left out. */
const PARTS: [keyof Counts, (count: number, counts: Counts) => string][] = [
  [
    'appliedSubtasks',
    (count, { createdSubtasks }) =>
      createdSubtasks > 0
        ? `${count} split into ${plural(createdSubtasks, 'subtask')}`
        : `${count} split`,
  ],
  ['suggestedSubtasks', (count) => `${count} split`],
  ['appliedLinks', (count) => `${plural(count, 'link')} added`],
  ['skipped', (count) => `${count} skipped`],
  ['duplicates', (count) => plural(count, 'duplicate')],
  ['claimed', (count) => `${count} busy`],
  ['superseded', (count) => `${count} changed meanwhile`],
  ['failed', (count) => `${count} failed`],
];

/**
 * "Looked at 6 tasks: 3 split into 9 subtasks, 1 link added; 2 need your answers. Found 1
 * related group." An output stored before auto mode parses with the auto counts at 0, so it reads
 * as before. Null when the run looked at nothing, which the dialog words on its own.
 */
export function summaryLine(output: Pick<DecomposerOutput, 'counts' | 'related'>): string | null {
  const { counts } = output;
  if (counts.considered === 0) return null;
  const parts = PARTS.filter(([key]) => counts[key] > 0)
    .map(([key, word]) => word(counts[key], counts))
    .join(', ');
  const questions =
    counts.needsClarification > 0
      ? `${plural(counts.needsClarification, 'needs', 'need')} your answers`
      : '';
  const details = [parts, questions].filter(Boolean).join('; ');
  const looked = `Looked at ${plural(counts.considered, 'task')}`;
  const toReview = output.related.filter((group) => !group.applied).length;
  const related = toReview > 0 ? ` Found ${plural(toReview, 'related group')}.` : '';
  return `${details ? `${looked}: ${details}` : looked}.${related}`;
}

/** How each outcome reads in the per-task list. */
export const OUTCOME_LABEL: Record<DecomposerOutcome, string> = {
  suggested_subtasks: 'Subtasks suggested',
  applied_subtasks: 'Subtasks created',
  needs_clarification: 'Has a question for you',
  skipped: 'Skipped',
  duplicate: 'Looks like a duplicate',
  claimed: 'Busy in another run',
  superseded: 'Changed during the run',
  failed: 'Failed',
};

/** A related group as the dialog lists it: its tasks by identifier, and whether it was linked. */
export function relatedGroupText(
  group: DecomposerOutput['related'][number],
  tasks: DecomposerOutput['tasks'],
): { names: string; status: string } {
  const names = group.taskIds
    .map((id) => tasks.find((task) => task.taskId === id)?.identifier ?? `#${id}`)
    .join(', ');
  if (group.applied) return { names, status: 'Linked' };
  return {
    names,
    status: group.relation === 'duplicates' ? 'Possible duplicates to review' : 'Overlap to review',
  };
}
