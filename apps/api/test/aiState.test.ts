import type { AiState } from '@postdog/shared';
import { describe, expect, it } from 'vitest';
import { recomputeAllAiStates } from '../src/repositories/aiState';
import { releaseClaims, renewClaims, tryClaim } from '../src/repositories/claims';
import { insertSuggestion, resolveSuggestion } from '../src/repositories/suggestions';
import { findTask } from '../src/repositories/tasks';
import {
  DAY,
  addRun,
  addTask,
  aiStateOf,
  clarificationFor,
  createTestDb,
  relatedOf,
  subtasksFor,
} from './suggestionFixtures';

const NOW = 50 * DAY;
const TTL = 2 * 60 * 1000;

describe('aiState precedence', () => {
  const matrix: { claim: boolean; clarification: boolean; subtasks: boolean; expected: AiState }[] =
    [
      { claim: false, clarification: false, subtasks: false, expected: 'none' },
      { claim: false, clarification: false, subtasks: true, expected: 'suggestion_pending' },
      { claim: false, clarification: true, subtasks: false, expected: 'clarification_pending' },
      { claim: false, clarification: true, subtasks: true, expected: 'clarification_pending' },
      { claim: true, clarification: false, subtasks: false, expected: 'processing' },
      { claim: true, clarification: false, subtasks: true, expected: 'processing' },
      { claim: true, clarification: true, subtasks: false, expected: 'processing' },
      { claim: true, clarification: true, subtasks: true, expected: 'processing' },
    ];

  it.each(matrix)(
    'claim $claim, clarification $clarification, subtasks $subtasks: $expected',
    ({ claim, clarification, subtasks, expected }) => {
      for (const claimFirst of [true, false]) {
        const db = createTestDb();
        const task = addTask(db);
        const run = addRun(db);
        if (claim && claimFirst) tryClaim(db, task.id, run, 'decomposer', NOW);
        if (subtasks) insertSuggestion(db, subtasksFor(run, task.id, NOW));
        if (clarification) insertSuggestion(db, clarificationFor(run, task.id, NOW));
        if (claim && !claimFirst) tryClaim(db, task.id, run, 'decomposer', NOW);
        expect(aiStateOf(db, task.id)).toBe(expected);
      }
    },
  );

  it('shows the pending suggestion once the claim is released', () => {
    const db = createTestDb();
    const task = addTask(db);
    const run = addRun(db);
    tryClaim(db, task.id, run, 'decomposer', NOW);
    insertSuggestion(db, clarificationFor(run, task.id, NOW + 1));
    expect(aiStateOf(db, task.id)).toBe('processing');

    releaseClaims(db, run, NOW + 2);
    expect(aiStateOf(db, task.id)).toBe('clarification_pending');
  });

  it('puts a related suggestion on every task in the group', () => {
    const db = createTestDb();
    const [a, b, c, outside] = [addTask(db), addTask(db), addTask(db), addTask(db)];
    const run = addRun(db);
    const related = insertSuggestion(db, relatedOf(run, [a.id, b.id, c.id], NOW));
    expect([a, b, c, outside].map((t) => aiStateOf(db, t.id))).toEqual([
      'suggestion_pending',
      'suggestion_pending',
      'suggestion_pending',
      'none',
    ]);

    resolveSuggestion(db, related.id, 'rejected', NOW + 1);
    expect([a, b, c].map((t) => aiStateOf(db, t.id))).toEqual(['none', 'none', 'none']);
  });

  it('counts only pending suggestions', () => {
    const db = createTestDb();
    const task = addTask(db);
    const run = addRun(db);
    const clarification = insertSuggestion(db, clarificationFor(run, task.id, NOW));
    insertSuggestion(db, subtasksFor(run, task.id, NOW));

    resolveSuggestion(db, clarification.id, 'superseded', NOW + 1);
    expect(aiStateOf(db, task.id)).toBe('suggestion_pending');
  });

  it('ignores a claim from the moment it expires', () => {
    const db = createTestDb();
    const task = addTask(db);
    const run = addRun(db);
    tryClaim(db, task.id, run, 'decomposer', NOW);

    recomputeAllAiStates(db, NOW + TTL - 1);
    expect(aiStateOf(db, task.id)).toBe('processing');
    recomputeAllAiStates(db, NOW + TTL);
    expect(aiStateOf(db, task.id)).toBe('none');
  });

  it('never changes updatedAt or statusChangedAt', () => {
    const db = createTestDb();
    const task = addTask(db);
    const other = addTask(db);
    const run = addRun(db);
    const later = task.updatedAt + 3 * DAY;

    tryClaim(db, task.id, run, 'decomposer', later);
    renewClaims(db, run, later + 1);
    const subtasks = insertSuggestion(db, subtasksFor(run, task.id, later + 2));
    insertSuggestion(db, relatedOf(run, [task.id, other.id], later + 3));
    releaseClaims(db, run, later + 4);
    resolveSuggestion(db, subtasks.id, 'rejected', later + 5);
    recomputeAllAiStates(db, later + 6);

    expect(aiStateOf(db, task.id)).toBe('suggestion_pending');
    for (const before of [task, other]) {
      expect(findTask(db, before.id)).toMatchObject({
        updatedAt: before.updatedAt,
        statusChangedAt: before.statusChangedAt,
      });
    }
  });
});
