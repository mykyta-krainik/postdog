import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  agentRunSchema,
  apiErrorBodySchema,
  listAgentRunsResponseSchema,
  plannerInputSchema,
  plannerLatestResponseSchema,
  plannerOutputSchema,
  type PlannerOutput,
} from '@postdog/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, type AppDeps } from '../../src/app';
import { defineAgent } from '../../src/agents/core/definition';
import { createLlm } from '../../src/agents/core/llm';
import { runAgent } from '../../src/agents/core/runAgent';
import {
  createTracer,
  type GenerationResult,
  type ObservationResult,
  type RunTraceStart,
  type Tracer,
} from '../../src/agents/core/tracer';
import { agentRegistry } from '../../src/agents/registry';
import { bootDatabase } from '../../src/db/boot';
import { IN_MEMORY, openDatabase } from '../../src/db/client';
import { migrateDatabase } from '../../src/db/migrate';
import { findRun, insertRun } from '../../src/repositories/agentRuns';
import { reconcileInterruptedRuns } from '../../src/services/agentRuns';
import { type Api, createTask, jsonClient, setNow } from '../helpers';
import { call, createTestTools, hang, script, waitForRun, type Step } from './helpers';

afterEach(() => {
  vi.useRealTimers();
});

const plan = (taskId: number): PlannerOutput => ({
  focus: [{ taskId, identifier: `PD-${taskId}`, title: 'Task', reason: 'Do it', signals: [] }],
  warnings: [],
  coordinationNotes: [],
});

function testPlanner(steps: Step[] | (() => never)) {
  const loopName = Array.isArray(steps) ? script(steps).name : 'unused';
  return defineAgent({
    name: 'planner',
    promptVersion: 'TEST_PROMPT_V1',
    input: plannerInputSchema,
    output: plannerOutputSchema,
    run: async (ctx) => {
      if (!Array.isArray(steps)) steps();
      const { tools } = createTestTools();
      const result = await runAgent({
        ...ctx,
        name: loopName,
        system: 'Test planner',
        userMessage: 'Plan',
        tools,
      });
      return { output: plan(Number(result.output.answer)) };
    },
  });
}

function api(planner?: ReturnType<typeof testPlanner>, deps: AppDeps = {}): Api {
  const db = openDatabase(IN_MEMORY);
  migrateDatabase(db);
  return jsonClient(
    createApp(db, {
      ...deps,
      agents: { ...agentRegistry, ...(planner && { planner }) },
    }),
  );
}

async function startPlanner(app: Api): Promise<number> {
  const res = await app.post('/api/agents/planner/run').send({}).expect(202);
  expect(Object.keys(res.body)).toEqual(['runId']);
  return res.body.runId as number;
}

describe('agent runs over HTTP', () => {
  it('answers 202 at once and the polled run ends completed with output, trace and usage', async () => {
    const app = api(testPlanner([call('lookup', { id: 1 }), call('finish', { answer: '1' })]));
    const runId = await startPlanner(app);

    const run = await waitForRun(app, runId);
    expect(run).toMatchObject({
      id: runId,
      agent: 'planner',
      mode: null,
      status: 'completed',
      promptVersion: 'TEST_PROMPT_V1',
      input: {},
      output: plan(1),
      error: null,
      langfuseTraceId: null,
      llm: { mode: 'mock', model: 'mock' },
    });
    expect(run.trace.map((s) => s.type)).toEqual(['llm', 'tool', 'llm', 'tool']);
    const llmTokens = run.trace.flatMap((s) => (s.tokens ? [s.tokens.input] : []));
    expect(run.usage!.inputTokens).toBe(llmTokens[0]! + llmTokens[1]!);
    expect(run.finishedAt).toBeGreaterThanOrEqual(run.startedAt);
    // The raw body, since the schema would read a missing trigger as manual.
    expect((await app.get(`/api/agents/runs/${runId}`).expect(200)).body.trigger).toBe('manual');
  });

  it('stores a failed loop with its error code and the trace so far', async () => {
    const app = api(testPlanner([{ text: 'no' }, { text: 'still no' }]));
    const run = await waitForRun(app, await startPlanner(app));
    expect(run.status).toBe('failed');
    expect(run.error!.code).toBe('no_terminal_tool');
    expect(run.output).toBeNull();
    expect(run.trace.filter((s) => s.type === 'llm')).toHaveLength(2);
    expect(run.usage!.inputTokens).toBeGreaterThan(0);
  });

  it('stores a crash in the agent code as internal_error', async () => {
    const app = api(
      testPlanner(() => {
        throw new Error('database is locked');
      }),
    );
    const run = await waitForRun(app, await startPlanner(app));
    expect(run.status).toBe('failed');
    expect(run.error).toEqual({
      code: 'internal_error',
      message: 'The agent crashed: database is locked',
    });
  });

  it('cancels a running run, and a second cancel is a 409 conflict', async () => {
    const app = api(testPlanner([hang]));
    const runId = await startPlanner(app);

    const res = await app.post(`/api/agents/runs/${runId}/cancel`).expect(200);
    expect(agentRunSchema.parse(res.body)).toMatchObject({
      status: 'cancelled',
      error: { code: 'cancelled', message: 'Cancelled by the user.' },
    });
    expect((await waitForRun(app, runId)).status).toBe('cancelled');

    const again = await app.post(`/api/agents/runs/${runId}/cancel`).expect(409);
    expect(apiErrorBodySchema.parse(again.body).error.code).toBe('conflict');
  });

  it('answers 409 when cancelling a finished run and 404 for an unknown one', async () => {
    const app = api(testPlanner([call('finish', { answer: '1' })]));
    const runId = await startPlanner(app);
    await waitForRun(app, runId);
    await app.post(`/api/agents/runs/${runId}/cancel`).expect(409);
    await app.get('/api/agents/runs/999').expect(404);
    await app.post('/api/agents/runs/999/cancel').expect(404);
  });

  it('lists run summaries newest first with agent, status and limit filters', async () => {
    setNow(1_000);
    const app = api(testPlanner([call('finish', { answer: '1' })]));
    const first = await startPlanner(app);
    await waitForRun(app, first);
    setNow(2_000);
    const second = await app
      .post('/api/agents/status-updater/run')
      .send({ scope: 'since' })
      .expect(202);
    await waitForRun(app, second.body.runId);

    const listed = await app.get('/api/agents/runs').expect(200);
    const all = listAgentRunsResponseSchema.parse(listed.body);
    expect(all.items.map((r) => r.id)).toEqual([second.body.runId, first]);
    expect(listed.body.items.map((r: { trigger: string }) => r.trigger)).toEqual([
      'manual',
      'manual',
    ]);
    expect(all.items[0]).not.toHaveProperty('trace');
    expect(all.items[0]).not.toHaveProperty('input');
    expect(all.items[0]).not.toHaveProperty('output');

    const planner = await app.get('/api/agents/runs?agent=planner').expect(200);
    expect(planner.body.items.map((r: { id: number }) => r.id)).toEqual([first]);
    const failed = await app.get('/api/agents/runs?status=failed').expect(200);
    expect(failed.body.items.map((r: { id: number }) => r.id)).toEqual([second.body.runId]);
    const limited = await app.get('/api/agents/runs?limit=1').expect(200);
    expect(limited.body.items).toHaveLength(1);
    await app.get('/api/agents/runs?status=queued').expect(400);
  });

  it('returns the latest completed plan and counts tasks changed after it', async () => {
    setNow(1_000);
    const app = api(testPlanner([call('finish', { answer: '1' })]));
    expect((await app.get('/api/agents/planner/latest').expect(200)).body).toEqual({
      latest: null,
    });

    await createTask(app, { title: 'Before' });
    const runId = await startPlanner(app);
    await waitForRun(app, runId);
    setNow(5_000);
    await createTask(app, { title: 'After' });

    const res = await app.get('/api/agents/planner/latest').expect(200);
    const { latest } = plannerLatestResponseSchema.parse(res.body);
    expect(latest!.run.id).toBe(runId);
    expect(latest!.run.output).toEqual(plan(1));
    expect(latest!.changedSince).toBe(1);
  });

  it('validates run bodies with the contract schemas', async () => {
    const app = api();
    const res = await app
      .post('/api/agents/status-updater/run')
      .send({ scope: 'week' })
      .expect(400);
    expect(res.body.error.code).toBe('validation_error');
    await app.post('/api/agents/status-updater/run').send({ scope: 'task' }).expect(400);
    expect((await app.get('/api/agents/runs')).body.items).toEqual([]);
  });

  it('reports the model layer in use', async () => {
    const res = await api().get('/api/agents/info').expect(200);
    expect(res.body).toEqual({ llm: { mode: 'mock', model: 'mock' } });
  });
});

describe('AI kill switch', () => {
  const routes: [method: 'get' | 'post', path: string][] = [
    ['post', '/api/agents/planner/run'],
    ['post', '/api/agents/status-updater/run'],
    ['get', '/api/agents/runs'],
    ['get', '/api/agents/runs/1'],
    ['post', '/api/agents/runs/1/cancel'],
    ['get', '/api/agents/info'],
    ['get', '/api/agents/planner/latest'],
  ];

  it('answers 403 ai_disabled on every agents route while AI is off', async () => {
    const app = api();
    await app.patch('/api/settings').send({ aiEnabled: false }).expect(200);
    for (const [method, path] of routes) {
      const res = await app[method](path).send({ scope: 'since' });
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(apiErrorBodySchema.parse(res.body).error.code).toBe('ai_disabled');
    }
    await app.patch('/api/settings').send({ aiEnabled: true }).expect(200);
    expect((await app.get('/api/agents/runs').expect(200)).body.items).toEqual([]);
  });

  it('cancels running runs when AI is turned off', async () => {
    const app = api(testPlanner([hang]));
    const runId = await startPlanner(app);
    await app.patch('/api/settings').send({ aiEnabled: false }).expect(200);
    await app.get(`/api/agents/runs/${runId}`).expect(403);

    await app.patch('/api/settings').send({ aiEnabled: true }).expect(200);
    expect(await waitForRun(app, runId)).toMatchObject({
      status: 'cancelled',
      error: { code: 'ai_disabled', message: 'AI was turned off in Settings.' },
    });
  });

  it('keeps the tracker working end to end with AI off and no API key', async () => {
    const llm = createLlm({ LLM_MOCK: false, LLM_MODEL: 'anthropic:claude-sonnet-5-5' });
    expect(llm.info.mode).toBe('mock');
    const app = api(undefined, { llm });
    await app.patch('/api/settings').send({ aiEnabled: false }).expect(200);

    const parent = await createTask(app, { title: 'Parent', priority: 'high' });
    const other = await createTask(app, { title: 'Other' });
    await app
      .post(`/api/tasks/${parent.id}/subtasks`)
      .send({ subtasks: [{ title: 'Child' }], baseUpdatedAt: parent.updatedAt })
      .expect(201);
    await app.patch(`/api/tasks/${parent.id}`).send({ status: 'in_progress' }).expect(200);
    await app.post(`/api/tasks/${parent.id}/notes`).send({ body: 'Started' }).expect(201);
    await app
      .post(`/api/tasks/${parent.id}/links`)
      .send({ toTaskId: other.id, type: 'blocks' })
      .expect(201);
    const list = await app.get('/api/tasks?sort=priority').expect(200);
    expect(list.body.items.map((t: { id: number }) => t.id)).toEqual([parent.id, other.id]);
    await app.delete(`/api/tasks/${other.id}`).expect(204);
    await app.get('/api/agents/info').expect(403);
  });
});

describe('boot reconcile', () => {
  it('marks runs left running by an unclean stop as failed with interrupted', () => {
    const dir = mkdtempSync(join(tmpdir(), 'postdog-runs-'));
    try {
      const path = join(dir, 'postdog.db');
      const first = bootDatabase(path, 1_000);
      const stuck = insertRun(first.db, {
        agent: 'planner',
        mode: null,
        status: 'running',
        promptVersion: 'PLANNER_PROMPT_V1',
        input: {},
        trace: [],
        llm: { mode: 'mock', model: 'mock' },
        startedAt: 1_000,
      });
      first.db.$client.close();

      const second = bootDatabase(path, 9_000);
      expect(reconcileInterruptedRuns(second.db, 9_000)).toBe(1);
      expect(findRun(second.db, stuck.id)).toMatchObject({
        status: 'failed',
        error: { code: 'interrupted' },
        finishedAt: 9_000,
      });
      second.db.$client.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('Langfuse tracing', () => {
  function fakeTracer() {
    const events: unknown[][] = [];
    const tracer: Tracer = {
      enabled: true,
      startRun: (start: RunTraceStart) => {
        events.push(['startRun', start]);
        return {
          traceId: 'trace-123',
          generation: (g) => ({
            end: (r: GenerationResult) => events.push(['generation', g.model, r.usage, r.error]),
          }),
          span: (s) => ({
            end: (r: ObservationResult) => events.push(['span', s.name, r.error]),
          }),
          end: (r: ObservationResult) => events.push(['end', r.error ?? 'ok']),
        };
      },
      flush: async () => {
        events.push(['flush']);
      },
    };
    return { tracer, events };
  }

  it('records one trace per run with a generation per model call and a span per tool call', async () => {
    const { tracer, events } = fakeTracer();
    const app = api(testPlanner([call('lookup', { id: 404 }), call('finish', { answer: '1' })]), {
      tracer,
    });
    const runId = await startPlanner(app);
    const run = await waitForRun(app, runId);
    await vi.waitFor(() => expect(events.at(-1)).toEqual(['flush']));

    expect(run.langfuseTraceId).toBe('trace-123');
    expect(events[0]).toEqual([
      'startRun',
      { runId, agent: 'planner', promptVersion: 'TEST_PROMPT_V1', mode: 'mock', input: {} },
    ]);
    expect(events.slice(1).map((e) => e.filter((v) => v !== undefined))).toEqual([
      ['generation', 'mock', run.trace[0]!.tokens && { ...run.trace[0]!.tokens }],
      ['span', 'lookup', 'Item 404 not found. Use lookup with an id from the list.'],
      ['generation', 'mock', run.trace[2]!.tokens && { ...run.trace[2]!.tokens }],
      ['span', 'finish'],
      ['end', 'ok'],
      ['flush'],
    ]);
  });

  it('ends the trace with the error and still flushes when the run fails', async () => {
    const { tracer, events } = fakeTracer();
    const app = api(testPlanner([{ text: 'a' }, { text: 'b' }]), { tracer });
    await waitForRun(app, await startPlanner(app));
    await vi.waitFor(() => expect(events.at(-1)).toEqual(['flush']));
    expect(events.at(-2)).toEqual(['end', expect.stringMatching(/^no_terminal_tool: /)]);
  });

  it('is a no-op without keys, and the run stores no trace id', async () => {
    const tracer = createTracer({ LANGFUSE_PUBLIC_KEY: 'pk-only' });
    expect(tracer.enabled).toBe(false);
    const app = api(testPlanner([call('finish', { answer: '1' })]), { tracer });
    const run = await waitForRun(app, await startPlanner(app));
    expect(run).toMatchObject({ status: 'completed', langfuseTraceId: null });
  });
});
