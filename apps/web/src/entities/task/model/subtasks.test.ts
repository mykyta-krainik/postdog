import type { TaskStatus } from '@postdog/shared';
import { describe, expect, it } from 'vitest';
import { subtaskProgress, toggledStatus } from './subtasks';

const sub = (status: TaskStatus) => ({ status });

describe('subtaskProgress', () => {
  it('counts only finished subtasks as done', () => {
    const progress = subtaskProgress([sub('done'), sub('in_progress'), sub('todo'), sub('done')]);
    expect(progress).toEqual({
      done: 2,
      total: 4,
      counts: { done: 2, in_progress: 1, todo: 1 },
    });
  });

  it('reports no progress for a task without subtasks', () => {
    expect(subtaskProgress([])).toEqual({
      done: 0,
      total: 0,
      counts: { done: 0, in_progress: 0, todo: 0 },
    });
  });
});

describe('toggledStatus', () => {
  it('finishes a subtask that is open', () => {
    expect(toggledStatus('todo')).toBe('done');
    expect(toggledStatus('in_progress')).toBe('done');
  });

  it('reopens a finished subtask as todo', () => {
    expect(toggledStatus('done')).toBe('todo');
  });
});
