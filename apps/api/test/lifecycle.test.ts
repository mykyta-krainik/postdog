import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { plannerInputSchema, plannerOutputSchema, startRunResponseSchema } from '@postdog/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineAgent } from '../src/agents/core/definition';
import { mockLlm } from '../src/agents/core/llm';
import { noopTracer, type Tracer } from '../src/agents/core/tracer';
import { agentRegistry } from '../src/agents/registry';
import { createApp } from '../src/app';
import { bootDatabase } from '../src/db/boot';
import { openDatabase, type Db } from '../src/db/client';
import { listen, shutdown } from '../src/lifecycle';
import { findRun } from '../src/repositories/agentRuns';
import { createScheduler, SCHEDULER_TICK_MS } from '../src/scheduler';
import { createAgentRunService } from '../src/services/agentRuns';
import { addRun } from './suggestionFixtures';

const HOST = '127.0.0.1';

/** A Planner that works until its run is stopped. */
const busyPlanner = defineAgent({
  name: 'planner',
  promptVersion: 'TEST_PROMPT_V1',
  input: plannerInputSchema,
  output: plannerOutputSchema,
  run: (ctx) =>
    new Promise((_resolve, reject) => {
      ctx.signal.addEventListener('abort', () => reject(ctx.signal.reason as Error));
    }),
});

let dir: string;
let path: string;
const servers: Server[] = [];
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'postdog-lifecycle-'));
  path = join(dir, 'postdog.db');
});
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
  rmSync(dir, { recursive: true, force: true });
});

function portOf(server: Server): number {
  return (server.address() as AddressInfo).port;
}

async function occupiedPort(): Promise<number> {
  const server = createServer();
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, HOST, resolve));
  return portOf(server);
}

describe('listen', () => {
  it("leaves the runs and the schedule alone when the port is taken, so a second start cannot fail the first's", async () => {
    const { db } = bootDatabase(path);
    const live = addRun(db);
    const port = await occupiedPort();
    const scheduler = { start: vi.fn() };

    await expect(listen(createApp(db), db, { host: HOST, port }, scheduler)).rejects.toMatchObject({
      code: 'EADDRINUSE',
    });
    expect(findRun(db, live)?.status).toBe('running');
    expect(scheduler.start).not.toHaveBeenCalled();
    db.$client.close();
  });

  it('fails the runs an earlier process left running once the port is its own', async () => {
    const { db } = bootDatabase(path);
    const stuck = addRun(db);

    const { server, interrupted } = await listen(createApp(db), db, { host: HOST, port: 0 });
    servers.push(server);
    expect(interrupted).toBe(1);
    expect(findRun(db, stuck)).toMatchObject({ status: 'failed', error: { code: 'interrupted' } });
    db.$client.close();
  });
});

describe('shutdown', () => {
  async function startBusyRun(tracerFor: (db: Db) => Tracer = () => noopTracer) {
    const { db } = bootDatabase(path);
    const tracer = tracerFor(db);
    const agents = { ...agentRegistry, planner: busyPlanner };
    const runs = createAgentRunService({ db, llm: mockLlm, tracer, agents });
    const app = createApp(db, { runs, agents });
    const { server } = await listen(app, db, { host: HOST, port: 0 });
    const res = await fetch(`http://${HOST}:${portOf(server)}/api/agents/planner/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(202);
    const { runId } = startRunResponseSchema.parse(await res.json());
    return { db, runs, server, runId, tracer };
  }

  it("stops the process's runs, flushes the traces, then closes the database", async () => {
    const flushedWithDatabaseOpen: boolean[] = [];
    const started = await startBusyRun((db) => ({
      ...noopTracer,
      flush: async () => {
        flushedWithDatabaseOpen.push(db.$client.open);
      },
    }));

    expect(await shutdown(started)).toBe('clean');

    expect(flushedWithDatabaseOpen.length).toBeGreaterThan(0);
    expect(flushedWithDatabaseOpen).not.toContain(false);
    expect(started.db.$client.open).toBe(false);
    expect(started.server.listening).toBe(false);
    const after = openDatabase(path);
    expect(findRun(after, started.runId)).toMatchObject({
      status: 'failed',
      error: { code: 'interrupted' },
    });
    after.$client.close();
  });

  it('starts the daily runs once the port is its own and stops them before anything else', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { db } = bootDatabase(path);
    const runs = createAgentRunService({
      db,
      llm: mockLlm,
      tracer: noopTracer,
      agents: agentRegistry,
    });
    // Each tick reads the clock once. At 3:00 no slot is due, so a tick starts nothing.
    const now = vi.fn(() => new Date(2026, 10, 24, 3).getTime());
    const scheduler = createScheduler({ db, runs, now });
    const { server } = await listen(
      createApp(db, { runs }),
      db,
      { host: HOST, port: 0 },
      scheduler,
    );

    vi.advanceTimersByTime(SCHEDULER_TICK_MS);
    expect(now).toHaveBeenCalledTimes(1);
    expect(await shutdown({ server, runs, tracer: noopTracer, db, scheduler })).toBe('clean');
    vi.advanceTimersByTime(SCHEDULER_TICK_MS * 4);
    expect(now).toHaveBeenCalledTimes(1);
  });

  it('gives up on a step that hangs and still closes the database', async () => {
    const tracer: Tracer = { ...noopTracer, flush: () => new Promise(() => {}) };
    const started = await startBusyRun();

    const begun = Date.now();
    expect(await shutdown({ ...started, tracer }, 100)).toBe('timed_out');
    expect(Date.now() - begun).toBeLessThan(2_000);
    expect(started.db.$client.open).toBe(false);
  });
});
