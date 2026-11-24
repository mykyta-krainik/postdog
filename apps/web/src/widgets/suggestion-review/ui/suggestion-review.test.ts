import {
  suggestionSchema,
  taskDetailSchema,
  type Settings,
  type Suggestion,
  type TaskDetail,
} from '@postdog/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SWRConfig } from 'swr';
import { describe, expect, it } from 'vitest';
import { settingsKey } from '@/entities/settings';
import { SuggestionReview } from '../index';

const base = {
  runId: 41,
  targetType: 'task',
  targetId: 12,
  status: 'pending',
  createdAt: 1,
  resolvedAt: null,
} as const;

const subtasks = suggestionSchema.parse({
  ...base,
  id: 1,
  kind: 'subtasks',
  payload: {
    subtasks: [
      { title: 'Write the middleware', priority: 'high' },
      { title: 'Add tests', description: 'Cover the 429 path' },
    ],
    rationale: 'Feature tasks get a tests subtask.',
  },
});

const clarification = suggestionSchema.parse({
  ...base,
  id: 2,
  kind: 'clarification',
  payload: {
    questions: ['Which endpoints need limits?'],
    whatIsUnclear: 'The task names no endpoints.',
  },
});

const related = suggestionSchema.parse({
  ...base,
  id: 3,
  kind: 'related',
  payload: { relation: 'duplicates', taskIds: [9, 12], reason: 'Both add rate limits.' },
});

function task(pendingSuggestions: Suggestion[]): TaskDetail {
  return taskDetailSchema.parse({
    id: 12,
    identifier: 'PD-12',
    title: 'Rate limits',
    description: '',
    status: 'todo',
    priority: 'high',
    parentId: null,
    aiState: 'suggestion_pending',
    createdAt: 1,
    updatedAt: 5,
    statusChangedAt: 1,
    subtasks: [],
    links: [],
    pendingSuggestions,
  });
}

function render(detail: TaskDetail, aiEnabled: boolean): string {
  const settings: Settings = {
    aiEnabled,
    decompositionMode: 'suggest',
    scheduledRunsEnabled: true,
  };
  return renderToStaticMarkup(
    createElement(
      SWRConfig,
      { value: { provider: () => new Map(), fallback: { [settingsKey]: settings } } },
      createElement(SuggestionReview, { task: detail }),
    ),
  );
}

describe('SuggestionReview', () => {
  it('shows a split to edit and a clarification to answer, each marked Suggested', () => {
    const html = render(task([subtasks, clarification]), true);
    expect(html).toContain('2 to review');
    expect(html).toContain('Split into 2 subtasks');
    expect(html).toContain('value="Write the middleware"');
    expect(html).toContain('Add 2 subtasks');
    expect(html).toContain('Which endpoints need limits?');
    expect(html).toContain('Send answers');
    expect(html).toContain('Generate anyway');
    expect(html.match(/<\/svg>Suggested</g)).toHaveLength(2);
  });

  it('is hidden when the task has no pending suggestions', () => {
    expect(render(task([]), true)).toBe('');
  });

  it('is hidden entirely while AI is off, whatever is pending', () => {
    expect(render(task([subtasks, clarification, related]), false)).toBe('');
  });
});
