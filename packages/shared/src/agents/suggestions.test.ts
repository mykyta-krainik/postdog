import { describe, expect, it } from 'vitest';
import {
  clarificationPayloadSchema,
  parseSuggestionPayload,
  relatedPayloadSchema,
  subtasksPayloadSchema,
  suggestionSchema,
} from '@postdog/shared';

const subtask = (title: string) => ({ title });
const subtasks = (n: number) => Array.from({ length: n }, (_, i) => subtask(`Step ${i + 1}`));

describe('subtasksPayloadSchema', () => {
  it('trims titles and defaults descriptions to empty', () => {
    const parsed = subtasksPayloadSchema.parse({
      subtasks: [{ title: '  Write the migration  ' }, { title: 'Add tests', priority: 'high' }],
      rationale: ' Schema first ',
    });
    expect(parsed).toEqual({
      subtasks: [
        { title: 'Write the migration', description: '' },
        { title: 'Add tests', description: '', priority: 'high' },
      ],
      rationale: 'Schema first',
    });
  });

  it('takes 2 to 8 subtasks', () => {
    const parse = (n: number) =>
      subtasksPayloadSchema.safeParse({ subtasks: subtasks(n), rationale: 'r' }).success;
    expect([parse(1), parse(2), parse(8), parse(9)]).toEqual([false, true, true, false]);
  });

  it('bounds the title, the description and the rationale', () => {
    const parse = (item: object, rationale = 'r') =>
      subtasksPayloadSchema.safeParse({ subtasks: [item, subtask('b')], rationale }).success;
    expect(parse(subtask('a'.repeat(200)))).toBe(true);
    expect(parse(subtask('a'.repeat(201)))).toBe(false);
    expect(parse(subtask('   '))).toBe(false);
    expect(parse({ title: 'a', description: 'd'.repeat(1500) })).toBe(true);
    expect(parse({ title: 'a', description: 'd'.repeat(1501) })).toBe(false);
    expect(parse(subtask('a'), 'r'.repeat(1000))).toBe(true);
    expect(parse(subtask('a'), 'r'.repeat(1001))).toBe(false);
    expect(parse(subtask('a'), '  ')).toBe(false);
  });
});

describe('clarificationPayloadSchema', () => {
  const parse = (questions: string[]) =>
    clarificationPayloadSchema.safeParse({ questions, whatIsUnclear: 'The scope' }).success;

  it('takes 1 to 3 questions of up to 300 characters', () => {
    expect([parse([]), parse(['a']), parse(['a', 'b', 'c']), parse(['a', 'b', 'c', 'd'])]).toEqual([
      false,
      true,
      true,
      false,
    ]);
    expect(parse(['q'.repeat(300)])).toBe(true);
    expect(parse(['q'.repeat(301)])).toBe(false);
    expect(parse(['  '])).toBe(false);
  });

  it('requires whatIsUnclear', () => {
    expect(clarificationPayloadSchema.safeParse({ questions: ['Which API?'] }).success).toBe(false);
  });
});

describe('relatedPayloadSchema', () => {
  const parse = (taskIds: number[], relation = 'duplicates') =>
    relatedPayloadSchema.safeParse({ relation, taskIds, reason: 'Same work' }).success;

  it('takes 2 or more distinct task ids', () => {
    expect(parse([3, 7])).toBe(true);
    expect(parse([3, 7, 9], 'overlaps')).toBe(true);
    expect(parse([3])).toBe(false);
    expect(parse([3, 3])).toBe(false);
  });

  it('rejects an unknown relation', () => {
    expect(parse([3, 7], 'relates')).toBe(false);
  });
});

describe('parseSuggestionPayload', () => {
  const proposal = { subtasks: subtasks(2), rationale: 'Split by layer' };

  it('validates with the schema of the given kind', () => {
    const result = parseSuggestionPayload('subtasks', proposal);
    expect(result.success && result.data.subtasks.map((s) => s.description)).toEqual(['', '']);
    expect(parseSuggestionPayload('clarification', proposal).success).toBe(false);
  });

  it('reports issue paths relative to the payload', () => {
    const result = parseSuggestionPayload('subtasks', { ...proposal, subtasks: [subtask('')] });
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toContain('subtasks.0.title');
  });
});

describe('suggestionSchema', () => {
  const row = {
    id: 1,
    runId: 4,
    targetType: 'task',
    targetId: 12,
    status: 'pending',
    createdAt: 1_000,
    resolvedAt: null,
  };

  it('types the payload by kind', () => {
    const parsed = suggestionSchema.parse({
      ...row,
      kind: 'clarification',
      payload: { questions: ['Which API?'], whatIsUnclear: 'The scope' },
    });
    expect(parsed.kind === 'clarification' && parsed.payload.questions).toEqual(['Which API?']);
  });

  it('rejects a payload of another kind, mark_stale and doc targets', () => {
    const related = { relation: 'overlaps', taskIds: [12, 15], reason: 'Both touch auth' };
    expect(suggestionSchema.safeParse({ ...row, kind: 'related', payload: related }).success).toBe(
      true,
    );
    expect(suggestionSchema.safeParse({ ...row, kind: 'subtasks', payload: related }).success).toBe(
      false,
    );
    expect(suggestionSchema.safeParse({ ...row, kind: 'mark_stale', payload: {} }).success).toBe(
      false,
    );
    expect(
      suggestionSchema.safeParse({ ...row, targetType: 'doc', kind: 'related', payload: related })
        .success,
    ).toBe(false);
  });
});
