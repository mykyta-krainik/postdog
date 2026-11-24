import { plannerInputSchema, plannerOutputSchema, type AgentRun } from '@postdog/shared';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { defineAgent } from '../src/agents/core/definition';
import { agentRegistry } from '../src/agents/registry';
import type { Db } from '../src/db/client';
import {
  findActiveClaim,
  listActiveClaims,
  releaseClaims,
  releaseTaskClaim,
  renewClaims,
  tryClaim,
} from '../src/repositories/claims';
import { waitForRun } from './agents/helpers';
import { DAY, addRun, addTask, aiStateOf, createTestDb } from './suggestionFixtures';
import { jsonClient } from './helpers';

const NOW = 50 * DAY;
const TTL = 2 * 60 * 1000;

function setup() {
  const db = createTestDb();
  return { db, task: addTask(db), a: addRun(db), b: addRun(db) };
}

describe('tryClaim', () => {
  it('claims a free task and sets processing', () => {
    const { db, task, a } = setup();
    expect(tryClaim(db, task.id, a, 'decomposer', NOW)).toEqual({ claimed: true });
    expect(findActiveClaim(db, task.id, NOW)).toEqual({
      taskId: task.id,
      runId: a,
      agent: 'decomposer',
      expiresAt: NOW + TTL,
    });
    expect(aiStateOf(db, task.id)).toBe('processing');
  });

  it('refuses a task another run holds and names the holder', () => {
    const { db, task, a, b } = setup();
    tryClaim(db, task.id, a, 'decomposer', NOW);
    expect(tryClaim(db, task.id, b, 'planner', NOW + TTL - 1)).toEqual({
      claimed: false,
      heldBy: { runId: a, agent: 'decomposer' },
    });
    expect(findActiveClaim(db, task.id, NOW)?.runId).toBe(a);
  });

  it('lets exactly one of several runs win the same task', () => {
    const { db, task } = setup();
    const runs = [addRun(db), addRun(db), addRun(db), addRun(db)];
    const results = runs.map((run) => tryClaim(db, task.id, run, 'decomposer', NOW));
    expect(results.filter((r) => r.claimed)).toHaveLength(1);
    expect(results[0]).toEqual({ claimed: true });
  });

  it('replaces a claim from the moment it expires', () => {
    const { db, task, a, b } = setup();
    tryClaim(db, task.id, a, 'decomposer', NOW);
    expect(tryClaim(db, task.id, b, 'decomposer', NOW + TTL)).toEqual({ claimed: true });
    expect(findActiveClaim(db, task.id, NOW + TTL)).toMatchObject({
      runId: b,
      expiresAt: NOW + 2 * TTL,
    });
    expect(findActiveClaim(db, task.id, NOW + 2 * TTL)).toBeUndefined();
  });

  it('renews a task the run already holds', () => {
    const { db, task, a } = setup();
    tryClaim(db, task.id, a, 'decomposer', NOW);
    expect(tryClaim(db, task.id, a, 'decomposer', NOW + 1_000)).toEqual({ claimed: true });
    expect(findActiveClaim(db, task.id, NOW)?.expiresAt).toBe(NOW + 1_000 + TTL);
  });

  it("commits or rolls back with the caller's transaction", () => {
    const { db, task, a } = setup();
    expect(() =>
      db.transaction((tx) => {
        tryClaim(tx, task.id, a, 'decomposer', NOW);
        expect(aiStateOf(tx, task.id)).toBe('processing');
        throw new Error('apply failed');
      }),
    ).toThrow('apply failed');
    expect(findActiveClaim(db, task.id, NOW)).toBeUndefined();
    expect(aiStateOf(db, task.id)).toBe('none');
  });
});

describe('renewClaims', () => {
  it('extends every claim of the run and no other', () => {
    const { db, task, a, b } = setup();
    const second = addTask(db);
    const others = addTask(db);
    tryClaim(db, task.id, a, 'decomposer', NOW);
    tryClaim(db, second.id, a, 'decomposer', NOW);
    tryClaim(db, others.id, b, 'decomposer', NOW);

    renewClaims(db, a, NOW + 100_000);
    const at = NOW + TTL + 50_000;
    expect(listActiveClaims(db, at).map((c) => c.taskId)).toEqual([task.id, second.id]);
    expect(tryClaim(db, task.id, b, 'decomposer', at).claimed).toBe(false);
    expect(tryClaim(db, others.id, a, 'decomposer', at).claimed).toBe(true);
  });
});

describe('releasing claims', () => {
  it('releaseClaims frees every task of the run and clears processing', () => {
    const { db, task, a, b } = setup();
    const second = addTask(db);
    tryClaim(db, task.id, a, 'decomposer', NOW);
    tryClaim(db, second.id, a, 'decomposer', NOW);

    releaseClaims(db, a, NOW + 1);
    expect(listActiveClaims(db, NOW + 1)).toEqual([]);
    expect([aiStateOf(db, task.id), aiStateOf(db, second.id)]).toEqual(['none', 'none']);
    expect(tryClaim(db, task.id, b, 'decomposer', NOW + 2).claimed).toBe(true);
  });

  it('releaseTaskClaim frees one task, and only for the run that holds it', () => {
    const { db, task, a, b } = setup();
    const second = addTask(db);
    tryClaim(db, task.id, a, 'decomposer', NOW);
    tryClaim(db, second.id, a, 'decomposer', NOW);

    releaseTaskClaim(db, task.id, b, NOW + 1);
    expect(findActiveClaim(db, task.id, NOW + 1)?.runId).toBe(a);

    releaseTaskClaim(db, task.id, a, NOW + 1);
    expect(findActiveClaim(db, task.id, NOW + 1)).toBeUndefined();
    expect(aiStateOf(db, task.id)).toBe('none');
    expect(aiStateOf(db, second.id)).toBe('processing');
  });

  it('listActiveClaims leaves out expired claims', () => {
    const { db, task, a } = setup();
    const second = addTask(db);
    tryClaim(db, task.id, a, 'decomposer', NOW);
    tryClaim(db, second.id, a, 'decomposer', NOW + 10);
    expect(listActiveClaims(db, NOW + TTL).map((c) => c.taskId)).toEqual([second.id]);
  });
});

describe('claims when a run ends', () => {
  function claimingAgent(db: Db, taskId: number, finish: Promise<void>) {
    return defineAgent({
      name: 'planner',
      promptVersion: 'TEST_PROMPT_V1',
      input: plannerInputSchema,
      output: plannerOutputSchema,
      run: async (ctx) => {
        tryClaim(db, taskId, ctx.runId, 'planner', Date.now());
        await finish;
        return {
          output: {
            focus: [{ taskId, identifier: 'PD-1', title: 'Task', reason: 'r', signals: [] }],
            warnings: [],
            coordinationNotes: [],
          },
        };
      },
    });
  }

  async function startRun(db: Db, finish: Promise<void>) {
    const task = addTask(db);
    const api = jsonClient(
      createApp(db, { agents: { ...agentRegistry, planner: claimingAgent(db, task.id, finish) } }),
    );
    const res = await api.post('/api/agents/planner/run').send({}).expect(202);
    return { api, task, runId: res.body.runId as number };
  }

  it('releases the claims of a completed run', async () => {
    const db = createTestDb();
    let done!: () => void;
    const { api, task, runId } = await startRun(db, new Promise((resolve) => (done = resolve)));
    expect(aiStateOf(db, task.id)).toBe('processing');

    done();
    const run: AgentRun = await waitForRun(api, runId);
    expect(run.status).toBe('completed');
    expect(listActiveClaims(db, Date.now())).toEqual([]);
    expect(aiStateOf(db, task.id)).toBe('none');
  });

  it('releases the claims of a cancelled run at once', async () => {
    const db = createTestDb();
    const { api, task, runId } = await startRun(db, new Promise(() => {}));
    expect(aiStateOf(db, task.id)).toBe('processing');

    await api.post(`/api/agents/runs/${runId}/cancel`).expect(200);
    expect(listActiveClaims(db, Date.now())).toEqual([]);
    expect(aiStateOf(db, task.id)).toBe('none');
  });
});
