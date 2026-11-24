import { listNotificationsResponseSchema, type RunStatus } from '@postdog/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockLlm } from '../src/agents/core/llm';
import { noopTracer } from '../src/agents/core/tracer';
import { createPlannerAgent } from '../src/agents/planner';
import { agentRegistry, type AgentRegistry } from '../src/agents/registry';
import { createApp } from '../src/app';
import type { Db } from '../src/db/client';
import { findRun, listRuns } from '../src/repositories/agentRuns';
import { getSetting } from '../src/repositories/settings';
import { createScheduler, dueRuns, type LastFired } from '../src/scheduler';
import { createAgentRunService } from '../src/services/agentRuns';
import { script, hang } from './agents/helpers';
import { jsonClient, setNow, type Api } from './helpers';
import { addTask, createTestDb } from './suggestionFixtures';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

/** A local time on a day of November 2026, in the zone the test runs in. */
const nov = (day: number, hour: number, minute = 0) =>
  new Date(2026, 10, day, hour, minute).getTime();

describe('dueRuns', () => {
  const cases: [string, number, LastFired, ReturnType<typeof dueRuns>][] = [
    ['nothing before the first slot', nov(24, 7, 59), {}, []],
    ['the Planner at 8:00', nov(24, 8), {}, [{ agent: 'planner', date: '2026-11-24' }]],
    [
      'the Planner late, within the catch-up window',
      nov(24, 13, 59),
      {},
      [{ agent: 'planner', date: '2026-11-24' }],
    ],
    ['not the Planner 6 hours late', nov(24, 14), {}, []],
    ['not the Planner once it fired today', nov(24, 8, 30), { planner: '2026-11-24' }, []],
    [
      'the Planner again the next day',
      nov(25, 8),
      { planner: '2026-11-24' },
      [{ agent: 'planner', date: '2026-11-25' }],
    ],
    [
      'the Status updater at 18:00, whatever the Planner did',
      nov(24, 18),
      { planner: '2026-11-24' },
      [{ agent: 'status_updater', date: '2026-11-24' }],
    ],
    [
      'only the Status updater at 18:00 when the Planner never fired',
      nov(24, 18),
      {},
      [{ agent: 'status_updater', date: '2026-11-24' }],
    ],
    [
      'the Status updater just before midnight',
      nov(24, 23, 59),
      { status_updater: '2026-11-23' },
      [{ agent: 'status_updater', date: '2026-11-24' }],
    ],
    ['neither slot just after midnight', nov(25, 0, 1), {}, []],
    [
      "the next month's first slot",
      new Date(2026, 11, 1, 8).getTime(),
      { planner: '2026-11-30' },
      [{ agent: 'planner', date: '2026-12-01' }],
    ],
  ];

  it.each(cases)('returns %s', (_name, now, lastFired, expected) => {
    expect(dueRuns(now, lastFired)).toEqual(expected);
  });

  it('keeps 8:00 local across daylight saving changes, by the local date', () => {
    vi.stubEnv('TZ', 'America/New_York');
    // Clocks went back on 1 Nov 2026: 7:30 that day is 24.5 hours after 8:00 the day before.
    const fallBack = (hour: number, minute = 0) => new Date(2026, 10, 1, hour, minute).getTime();
    expect(fallBack(8) - new Date(2026, 9, 31, 8).getTime()).toBe(25 * 60 * 60 * 1000);
    expect(dueRuns(fallBack(7, 30), { planner: '2026-10-31' })).toEqual([]);
    expect(dueRuns(fallBack(8), { planner: '2026-10-31' })).toEqual([
      { agent: 'planner', date: '2026-11-01' },
    ]);
    // Clocks went forward on 8 Mar 2026: 8:00 came 23 hours after 8:00 the day before.
    const springForward = new Date(2026, 2, 8, 8).getTime();
    expect(springForward - new Date(2026, 2, 7, 8).getTime()).toBe(23 * 60 * 60 * 1000);
    expect(dueRuns(springForward, { planner: '2026-03-07' })).toEqual([
      { agent: 'planner', date: '2026-03-08' },
    ]);
  });
});

/** The real app and run service over one database, with the scheduler the server would start. */
function setup(agents: AgentRegistry = agentRegistry, db: Db = createTestDb()) {
  const runs = createAgentRunService({ db, llm: mockLlm, tracer: noopTracer, agents });
  const scheduler = createScheduler({ db, runs });
  const api = jsonClient(createApp(db, { agents, runs }));
  return { db, runs, scheduler, api };
}

const runsIn = (db: Db) => listRuns(db, { limit: 50 });

/** Waits for the run to end by reading the database, so the wait itself watches nothing. */
async function ended(db: Db, runId: number): Promise<RunStatus> {
  for (let i = 0; i < 400; i++) {
    const status = findRun(db, runId)?.status;
    if (status && status !== 'running') return status;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Run ${runId} is still running`);
}

async function inbox(api: Api) {
  const res = await api.get('/api/notifications').expect(200);
  return listNotificationsResponseSchema.parse(res.body).items;
}

describe('the scheduler', () => {
  it('plans the day at 8:00 through the run service, and the Inbox says the plan is ready', async () => {
    setNow(nov(24, 7));
    const { db, scheduler, api } = setup();
    addTask(db, { title: 'Ship the export' });
    const manual = (await api.post('/api/agents/planner/run').send({}).expect(202)).body.runId;
    await ended(db, manual);

    setNow(nov(24, 7, 59));
    scheduler.tick();
    expect(runsIn(db)).toHaveLength(1);

    setNow(nov(24, 8));
    scheduler.tick();
    const [run] = runsIn(db);
    expect(run).toMatchObject({ agent: 'planner', trigger: 'scheduled', input: {} });
    expect(await ended(db, run!.id)).toBe('completed');
    expect(getSetting(db, 'lastScheduledRun:planner')).toBe('2026-11-24');

    // The manual run was watched by its start; the scheduled one was not.
    expect(await inbox(api)).toEqual([
      expect.objectContaining({
        kind: 'run_finished',
        title: 'Your plan for today is ready',
        runId: run!.id,
      }),
    ]);
    const res = await api.get(`/api/agents/runs/${run!.id}`).expect(200);
    expect(res.body.trigger).toBe('scheduled');
    expect((await api.get(`/api/agents/runs/${manual}`).expect(200)).body.trigger).toBe('manual');
  });

  it('writes the status update at 18:00 over the last 24 hours', async () => {
    setNow(nov(24, 11));
    const { db, scheduler, api } = setup();
    addTask(db, { title: 'Fix the login redirect', status: 'in_progress' });

    setNow(nov(24, 18));
    scheduler.tick();
    const [run] = runsIn(db);
    expect(run).toMatchObject({
      agent: 'status_updater',
      trigger: 'scheduled',
      input: { scope: 'since', since: nov(24, 18) - 24 * 60 * 60 * 1000 },
    });
    expect(await ended(db, run!.id)).toBe('completed');
    expect(await inbox(api)).toEqual([
      expect.objectContaining({ kind: 'run_finished', runId: run!.id }),
    ]);
    expect(getSetting(db, 'lastScheduledRun:status_updater')).toBe('2026-11-24');
  });

  it('fires a slot once, across ticks and a restart on the same database', async () => {
    setNow(nov(24, 8));
    const first = setup();
    addTask(first.db, { title: 'Ship the export' });
    first.scheduler.tick();
    const [run] = runsIn(first.db);
    await ended(first.db, run!.id);

    setNow(nov(24, 8, 30));
    first.scheduler.tick();
    const restarted = setup(agentRegistry, first.db);
    restarted.scheduler.tick();
    expect(runsIn(first.db).map((r) => r.id)).toEqual([run!.id]);

    setNow(nov(25, 8));
    restarted.scheduler.tick();
    expect(runsIn(first.db)).toHaveLength(2);
  });

  it.each([
    ['AI is off', { aiEnabled: false }, { aiEnabled: true }],
    ['the daily runs are off', { scheduledRunsEnabled: false }, { scheduledRunsEnabled: true }],
  ])(
    'skips while %s without using up the slot, then runs it once when turned back on in time',
    async (_name, off, on) => {
      setNow(nov(24, 8));
      const { db, scheduler, api } = setup();
      addTask(db, { title: 'Ship the export' });
      await api.patch('/api/settings').send(off).expect(200);
      scheduler.tick();
      expect(runsIn(db)).toEqual([]);
      expect(getSetting(db, 'lastScheduledRun:planner')).toBeUndefined();

      await api.patch('/api/settings').send(on).expect(200);
      setNow(nov(24, 9));
      scheduler.tick();
      const [run] = runsIn(db);
      expect(run).toMatchObject({ agent: 'planner', trigger: 'scheduled' });
      await ended(db, run!.id);
      setNow(nov(24, 9, 30));
      scheduler.tick();
      expect(runsIn(db)).toHaveLength(1);
    },
  );

  it('does not run a slot late when the switch comes back after the catch-up window', async () => {
    setNow(nov(24, 8));
    const { db, scheduler, api } = setup();
    addTask(db, { title: 'Ship the export' });
    await api.patch('/api/settings').send({ scheduledRunsEnabled: false }).expect(200);
    scheduler.tick();
    await api.patch('/api/settings').send({ scheduledRunsEnabled: true }).expect(200);
    setNow(nov(24, 14));
    scheduler.tick();
    expect(runsIn(db)).toEqual([]);
  });

  it('skips the slot for the day when a Planner run is already in progress', async () => {
    setNow(nov(24, 7, 58));
    const agents = { ...agentRegistry, planner: createPlannerAgent(script([hang]).name) };
    const { db, scheduler, api } = setup(agents);
    addTask(db, { title: 'Ship the export' });
    const manual = (await api.post('/api/agents/planner/run').send({}).expect(202)).body.runId;

    setNow(nov(24, 8));
    scheduler.tick();
    expect(runsIn(db).map((r) => r.id)).toEqual([manual]);
    expect(getSetting(db, 'lastScheduledRun:planner')).toBe('2026-11-24');

    await api.post(`/api/agents/runs/${manual}/cancel`).expect(200);
    setNow(nov(24, 8, 30));
    scheduler.tick();
    expect(runsIn(db).map((r) => r.id)).toEqual([manual]);
    expect(await inbox(api)).toEqual([]);
  });

  it('skips quietly when the Planner has nothing to plan', async () => {
    setNow(nov(24, 8));
    const { db, scheduler, api } = setup();
    addTask(db, { title: 'Shipped', status: 'done' });
    scheduler.tick();
    expect(runsIn(db)).toEqual([]);
    expect(await inbox(api)).toEqual([]);
    expect(getSetting(db, 'lastScheduledRun:planner')).toBe('2026-11-24');
  });

  it('skips quietly when no task changed in the last 24 hours', async () => {
    setNow(nov(23, 17));
    const { db, scheduler, api } = setup();
    addTask(db, { title: 'Fix the login redirect', status: 'in_progress' });
    setNow(nov(24, 18));
    scheduler.tick();
    expect(runsIn(db)).toEqual([]);
    expect(await inbox(api)).toEqual([]);
    expect(getSetting(db, 'lastScheduledRun:status_updater')).toBe('2026-11-24');
  });

  it('tells the Inbox when a scheduled run fails', async () => {
    setNow(nov(24, 8));
    const silent = createPlannerAgent(script([{ text: 'no' }, { text: 'still no' }]).name);
    const { db, scheduler, api } = setup({ ...agentRegistry, planner: silent });
    addTask(db, { title: 'Ship the export' });
    scheduler.tick();
    const [run] = runsIn(db);
    expect(await ended(db, run!.id)).toBe('failed');
    expect(await inbox(api)).toEqual([
      expect.objectContaining({
        kind: 'agent_failed',
        title: 'The Planner failed',
        runId: run!.id,
      }),
    ]);
  });
});
