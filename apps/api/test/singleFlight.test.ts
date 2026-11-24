import {
  apiErrorBodySchema,
  clarifyInputSchema,
  decomposerRunInputSchema,
  plannerInputSchema,
  statusUpdaterInputSchema,
  type AgentName,
} from '@postdog/shared';
import type { Response } from 'supertest';
import { describe, expect, it } from 'vitest';
import { z, type ZodType } from 'zod';
import { defineAgent } from '../src/agents/core/definition';
import { agentRegistry } from '../src/agents/registry';
import { createApp } from '../src/app';
import { insertSuggestion } from '../src/repositories/suggestions';
import { waitForRun } from './agents/helpers';
import { jsonClient } from './helpers';
import { addRun, addTask, clarificationFor, createTestDb } from './suggestionFixtures';

/** An agent that works until `release` is called or its run is stopped. */
function gatedAgent<I>(name: AgentName, input: ZodType<I>) {
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  const agent = defineAgent({
    name,
    promptVersion: 'TEST_PROMPT_V1',
    input,
    output: z.object({}),
    run: (ctx) =>
      new Promise<{ output: object }>((resolve, reject) => {
        void released.then(() => resolve({ output: {} }));
        ctx.signal.addEventListener('abort', () => reject(ctx.signal.reason as Error));
      }),
  });
  return { agent, release };
}

function setup() {
  const db = createTestDb();
  const planner = gatedAgent('planner', plannerInputSchema);
  const decomposer = gatedAgent('decomposer', decomposerRunInputSchema);
  const clarify = gatedAgent('decomposer', clarifyInputSchema);
  const statusUpdater = gatedAgent('status_updater', statusUpdaterInputSchema);
  const api = jsonClient(
    createApp(db, {
      agents: {
        ...agentRegistry,
        planner: planner.agent,
        decomposer: decomposer.agent,
        decomposer_clarify: clarify.agent,
        status_updater: statusUpdater.agent,
      },
    }),
  );
  const runCount = async () => (await api.get('/api/agents/runs').expect(200)).body.items.length;
  return { db, api, planner, runCount };
}

const conflictMessage = (res: Response) => {
  const { error } = apiErrorBodySchema.parse(res.body);
  expect(error.code).toBe('conflict');
  return error.message;
};

describe('one running run per agent', () => {
  it('answers parallel Planner starts with one 202 and 409 for the rest, saving one run', async () => {
    const { api, runCount } = setup();
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => api.post('/api/agents/planner/run').send({})),
    );

    const statuses = responses.map((res) => res.status).sort();
    expect(statuses).toEqual([202, 409, 409, 409, 409]);
    const runId = responses.find((res) => res.status === 202)!.body.runId as number;
    for (const res of responses.filter((r) => r.status === 409)) {
      expect(conflictMessage(res)).toBe(`A Planner run is already in progress (run #${runId}).`);
    }
    expect(await runCount()).toBe(1);
  });

  it('frees the slot when the run finishes', async () => {
    const { api, planner } = setup();
    const first = await api.post('/api/agents/planner/run').send({}).expect(202);
    await api.post('/api/agents/planner/run').send({}).expect(409);

    planner.release();
    expect((await waitForRun(api, first.body.runId as number)).status).toBe('completed');
    await api.post('/api/agents/planner/run').send({}).expect(202);
  });

  it('frees the slot when the run is cancelled', async () => {
    const { api } = setup();
    const first = await api.post('/api/agents/planner/run').send({}).expect(202);
    await api.post(`/api/agents/runs/${first.body.runId}/cancel`).send({}).expect(200);
    await api.post('/api/agents/planner/run').send({}).expect(202);
  });

  it('runs one Decomposer batch at a time', async () => {
    const { api, runCount } = setup();
    const first = await api.post('/api/agents/decomposer/run').send({}).expect(202);
    const second = await api.post('/api/agents/decomposer/run').send({}).expect(409);
    expect(conflictMessage(second)).toBe(
      `A Decomposer run is already in progress (run #${first.body.runId}).`,
    );
    expect(await runCount()).toBe(1);
  });

  it('answers clarifications of different suggestions together, the same one once', async () => {
    const { db, api } = setup();
    const run = addRun(db, 'decomposer', 'completed');
    const [a, b] = [addTask(db), addTask(db)].map((task) =>
      insertSuggestion(db, clarificationFor(run, task.id, Date.now())),
    );
    const clarify = (suggestionId: number) =>
      api.post('/api/agents/decomposer/clarify').send({ suggestionId, generateAnyway: true });

    const first = await clarify(a!.id).expect(202);
    await clarify(b!.id).expect(202);
    await api.post('/api/agents/decomposer/run').send({}).expect(202);
    const again = await clarify(a!.id).expect(409);
    expect(conflictMessage(again)).toBe(
      `A Decomposer run is already answering this clarification (run #${first.body.runId}).`,
    );
  });

  it('runs the Status updater once per scope', async () => {
    const { db, api } = setup();
    const [one, two] = [addTask(db), addTask(db)];
    const update = (body: object) => api.post('/api/agents/status-updater/run').send(body);

    await update({ scope: 'task', taskId: one!.id }).expect(202);
    await update({ scope: 'task', taskId: two!.id }).expect(202);
    await update({ scope: 'since' }).expect(202);
    await update({ scope: 'task', taskId: one!.id, tone: 'celebrate' }).expect(409);
    const since = await update({ scope: 'since', since: Date.now() - 60_000 }).expect(409);
    expect(conflictMessage(since)).toMatch(
      /^A Status updater run for the same scope is already in progress \(run #\d+\)\.$/,
    );
  });
});
