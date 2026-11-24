import type { Suggestion } from '@postdog/shared';

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** One line on what a suggestion proposes, such as "Split into 4 subtasks". */
export function describeSuggestion(suggestion: Suggestion): string {
  switch (suggestion.kind) {
    case 'subtasks':
      return `Split into ${plural(suggestion.payload.subtasks.length, 'subtask')}`;
    case 'clarification':
      return `${plural(suggestion.payload.questions.length, 'question')} before splitting`;
    case 'related': {
      const others = plural(suggestion.payload.taskIds.length - 1, 'other task');
      return suggestion.payload.relation === 'duplicates'
        ? `Same work as ${others}`
        : `Overlaps with ${others}`;
    }
  }
}

/** The tasks a suggestion affects: its target, and every task of a related group. */
export function affectedTaskIds(suggestion: Suggestion): number[] {
  return suggestion.kind === 'related' ? suggestion.payload.taskIds : [suggestion.targetId];
}
