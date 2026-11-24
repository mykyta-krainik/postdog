import {
  createTaskInputSchema,
  type AgentName,
  type CreateTaskInput,
  type RelatedRelation,
  type RunStatus,
  type TaskDetail,
} from '@postdog/shared';
import { IN_MEMORY, openDatabase, type Db, type Executor } from '../src/db/client';
import { migrateDatabase } from '../src/db/migrate';
import { insertRun } from '../src/repositories/agentRuns';
import type { NewSuggestion } from '../src/repositories/suggestions';
import { findTask } from '../src/repositories/tasks';
import { createTaskService } from '../src/services/tasks';

export const DAY = 24 * 60 * 60 * 1000;

export function createTestDb(): Db {
  const db = openDatabase(IN_MEMORY);
  migrateDatabase(db);
  return db;
}

export function addTask(db: Db, input: Partial<CreateTaskInput> = {}): TaskDetail {
  return createTaskService(db).create(createTaskInputSchema.parse({ title: 'Task', ...input }));
}

export function addRun(
  ex: Executor,
  agent: AgentName = 'decomposer',
  status: RunStatus = 'running',
): number {
  return insertRun(ex, {
    agent,
    mode: agent === 'decomposer' ? 'suggest' : null,
    status,
    promptVersion: 'TEST_PROMPT_V1',
    input: {},
    trace: [],
    llm: { mode: 'mock', model: 'mock' },
    startedAt: 0,
  }).id;
}

export function aiStateOf(ex: Executor, taskId: number) {
  return findTask(ex, taskId)?.aiState;
}

export function subtasksFor(runId: number, taskId: number, createdAt: number): NewSuggestion {
  return {
    runId,
    targetType: 'task',
    targetId: taskId,
    kind: 'subtasks',
    payload: {
      subtasks: [
        { title: 'Write the migration', description: '' },
        { title: 'Add tests', description: '', priority: 'high' },
      ],
      rationale: 'Schema first, then tests',
    },
    createdAt,
  };
}

export function clarificationFor(runId: number, taskId: number, createdAt: number): NewSuggestion {
  return {
    runId,
    targetType: 'task',
    targetId: taskId,
    kind: 'clarification',
    payload: { questions: ['Which users does this cover?'], whatIsUnclear: 'The scope' },
    createdAt,
  };
}

export function relatedOf(
  runId: number,
  taskIds: number[],
  createdAt: number,
  relation: RelatedRelation = 'overlaps',
): NewSuggestion {
  return {
    runId,
    targetType: 'task',
    targetId: Math.min(...taskIds),
    kind: 'related',
    payload: { relation, taskIds, reason: 'Both change the login flow' },
    createdAt,
  };
}
