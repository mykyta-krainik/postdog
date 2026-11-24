import { listAgentRunsResponseSchema, type AgentName } from '@postdog/shared';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { insertRun } from '../src/repositories/agentRuns';
import { runLabel } from '../src/services/runLabel';
import { jsonClient } from './helpers';
import { addTask, createTestDb } from './suggestionFixtures';

describe('runLabel', () => {
  const db = createTestDb();
  addTask(db, { title: 'Ship the release' });

  it.each<[AgentName, unknown, string]>([
    ['planner', {}, 'Plan my day'],
    ['status_updater', { scope: 'since' }, 'My status update'],
    ['status_updater', { scope: 'since', since: 1_000 }, 'My status update'],
    ['status_updater', { scope: 'task', taskId: 1 }, 'Status update for PD-1'],
    ['status_updater', { scope: 'task', taskId: 99 }, 'Status update for task 99'],
    ['decomposer', {}, 'Decompose to-do tasks'],
    ['decomposer', { taskIds: [] }, 'Decompose to-do tasks'],
    ['decomposer', { taskIds: [4] }, 'Decompose 1 chosen task'],
    ['decomposer', { taskIds: [4, 5, 6] }, 'Decompose 3 chosen tasks'],
    ['decomposer', { suggestionId: 3, generateAnyway: true }, 'Answer a clarification'],
    ['docs_reviewer', {}, 'Docs review'],
    ['status_updater', null, 'My status update'],
  ])('labels a %s run with input %j as %j', (agent, input, label) => {
    expect(runLabel(db, agent, input)).toBe(label);
  });
});

describe('GET /api/agents/runs labels', () => {
  it('gives every summary the label of its stored input', async () => {
    const db = createTestDb();
    addTask(db, { title: 'Ship the release' });
    const add = (agent: AgentName, input: unknown, startedAt: number) =>
      insertRun(db, {
        agent,
        mode: null,
        status: 'completed',
        promptVersion: 'TEST_PROMPT_V1',
        input,
        trace: [],
        llm: { mode: 'mock', model: 'mock' },
        startedAt,
      });
    add('planner', {}, 1);
    add('status_updater', { scope: 'task', taskId: 1 }, 2);
    add('decomposer', { taskIds: [1] }, 3);

    const res = await jsonClient(createApp(db)).get('/api/agents/runs').expect(200);
    expect(listAgentRunsResponseSchema.parse(res.body).items.map((r) => r.label)).toEqual([
      'Decompose 1 chosen task',
      'Status update for PD-1',
      'Plan my day',
    ]);
  });
});
