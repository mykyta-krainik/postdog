import { describe, expect, it } from 'vitest';
import {
  createSubtasksInputSchema,
  createTaskInputSchema,
  idParamsSchema,
  listTasksQuerySchema,
  updateTaskInputSchema,
} from '@postdog/shared';

describe('createTaskInputSchema', () => {
  it('fills in defaults for a title-only task', () => {
    expect(createTaskInputSchema.parse({ title: 'Fix login' })).toEqual({
      title: 'Fix login',
      description: '',
      status: 'todo',
      priority: 'medium',
    });
  });

  it('keeps explicit values and a parent id', () => {
    const input = {
      title: 'Write tests',
      description: 'Cover the edge cases',
      status: 'in_progress',
      priority: 'high',
      parentId: 4,
    };
    expect(createTaskInputSchema.parse(input)).toEqual(input);
  });

  it('trims the title and rejects one that is empty after trimming', () => {
    expect(createTaskInputSchema.parse({ title: '  Fix login  ' }).title).toBe('Fix login');
    expect(createTaskInputSchema.safeParse({ title: '   ' }).success).toBe(false);
    expect(createTaskInputSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a 200-character title and rejects 201', () => {
    expect(createTaskInputSchema.safeParse({ title: 'a'.repeat(200) }).success).toBe(true);
    expect(createTaskInputSchema.safeParse({ title: 'a'.repeat(201) }).success).toBe(false);
  });

  it('accepts a 10000-character description and rejects 10001', () => {
    const at = (n: number) => ({ title: 't', description: 'a'.repeat(n) });
    expect(createTaskInputSchema.safeParse(at(10_000)).success).toBe(true);
    expect(createTaskInputSchema.safeParse(at(10_001)).success).toBe(false);
  });

  it('rejects unknown status and priority values', () => {
    expect(createTaskInputSchema.safeParse({ title: 't', status: 'blocked' }).success).toBe(false);
    expect(createTaskInputSchema.safeParse({ title: 't', priority: 'urgent' }).success).toBe(false);
  });

  it('rejects a parent id that is not a positive integer', () => {
    expect(createTaskInputSchema.safeParse({ title: 't', parentId: 0 }).success).toBe(false);
    expect(createTaskInputSchema.safeParse({ title: 't', parentId: 1.5 }).success).toBe(false);
  });
});

describe('updateTaskInputSchema', () => {
  it('returns only the fields that were sent, with no defaults', () => {
    expect(updateTaskInputSchema.parse({ title: 'Renamed' })).toEqual({ title: 'Renamed' });
    expect(updateTaskInputSchema.parse({})).toEqual({});
  });

  it('applies the same bounds and enums as create', () => {
    expect(updateTaskInputSchema.safeParse({ title: ' ' }).success).toBe(false);
    expect(updateTaskInputSchema.safeParse({ status: 'blocked' }).success).toBe(false);
  });
});

describe('createSubtasksInputSchema', () => {
  const subtasks = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `Step ${i}` }));

  it('fills in subtask defaults', () => {
    expect(createSubtasksInputSchema.parse({ subtasks: subtasks(1), baseUpdatedAt: 5 })).toEqual({
      subtasks: [{ title: 'Step 0', description: '', priority: 'medium' }],
      baseUpdatedAt: 5,
    });
  });

  it('accepts 1 to 20 subtasks', () => {
    expect(createSubtasksInputSchema.safeParse({ subtasks: [], baseUpdatedAt: 5 }).success).toBe(
      false,
    );
    expect(
      createSubtasksInputSchema.safeParse({ subtasks: subtasks(20), baseUpdatedAt: 5 }).success,
    ).toBe(true);
    expect(
      createSubtasksInputSchema.safeParse({ subtasks: subtasks(21), baseUpdatedAt: 5 }).success,
    ).toBe(false);
  });

  it('requires baseUpdatedAt', () => {
    expect(createSubtasksInputSchema.safeParse({ subtasks: subtasks(1) }).success).toBe(false);
  });
});

describe('listTasksQuerySchema', () => {
  it('defaults to newest first with no filters', () => {
    expect(listTasksQuerySchema.parse({})).toEqual({ sort: 'createdAt', order: 'desc' });
  });

  it('parses query-string values', () => {
    expect(
      listTasksQuerySchema.parse({
        status: 'in_progress',
        sort: 'priority',
        order: 'asc',
        parentId: '7',
        q: ' login ',
      }),
    ).toEqual({ status: 'in_progress', sort: 'priority', order: 'asc', parentId: 7, q: 'login' });
  });

  it('treats an empty search as no search', () => {
    expect(listTasksQuerySchema.parse({ q: '   ' }).q).toBeUndefined();
  });

  it('rejects unknown enum values', () => {
    expect(listTasksQuerySchema.safeParse({ status: 'blocked' }).success).toBe(false);
    expect(listTasksQuerySchema.safeParse({ sort: 'title' }).success).toBe(false);
    expect(listTasksQuerySchema.safeParse({ order: 'up' }).success).toBe(false);
  });

  it('rejects a parent id that is not a positive integer', () => {
    for (const parentId of ['abc', '', '0', '1.5']) {
      expect(listTasksQuerySchema.safeParse({ parentId }).success).toBe(false);
    }
  });
});

describe('idParamsSchema', () => {
  it('parses a numeric route param', () => {
    expect(idParamsSchema.parse({ id: '12' })).toEqual({ id: 12 });
  });

  it('rejects ids that are not positive integers', () => {
    for (const id of ['abc', '0', '-3', '2.5']) {
      expect(idParamsSchema.safeParse({ id }).success).toBe(false);
    }
  });
});
