import { AI_STATES } from '@postdog/shared';
import { describe, expect, it } from 'vitest';
import { aiDotFor } from './ai-attention';

describe('aiDotFor', () => {
  it('shows the orange dot for tasks that wait for the user', () => {
    expect(aiDotFor('suggestion_pending', true)).toEqual({
      kind: 'attention',
      hint: 'Suggestions to review',
    });
    expect(aiDotFor('clarification_pending', true)).toEqual({
      kind: 'attention',
      hint: 'Waiting for your answer',
    });
  });

  it('shows the working variant while an agent holds the task', () => {
    expect(aiDotFor('processing', true)).toEqual({
      kind: 'working',
      hint: 'Postdog is working on this',
    });
  });

  it('shows nothing for idle tasks', () => {
    expect(aiDotFor('none', true)).toBeNull();
  });

  it('shows nothing at all while AI is off', () => {
    expect(AI_STATES.filter((state) => aiDotFor(state, false) !== null)).toEqual([]);
  });
});
