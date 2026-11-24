import {
  SCHEDULED_RUNS,
  type PlannerInput,
  type ScheduledAgent,
  type StatusUpdaterInput,
} from '@postdog/shared';
import { readyCandidates } from './agents/planner';
import { loadStatusScope } from './agents/status-updater/scope';
import type { Db, Executor } from './db/client';
import { AppError } from './lib/errors';
import { logger } from './lib/logger';
import { getSetting, setSetting } from './repositories/settings';
import type { AgentRunService } from './services/agentRuns';
import { readSettings } from './services/settings';

export const SCHEDULER_TICK_MS = 30_000;

/** How long after its time a slot may still start, when the API was down or AI was off at the time. */
export const CATCH_UP_MS = 6 * 60 * 60 * 1000;

/** The local date of each agent's latest slot that ran or was skipped for good. */
export type LastFired = Partial<Record<ScheduledAgent, string>>;

/** A slot to run now, and the local date (YYYY-MM-DD) it belongs to. */
export interface DueRun {
  agent: ScheduledAgent;
  date: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function localDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * The slots due at `now`. Each slot's latest time at or before now is due while it is less than
 * CATCH_UP_MS old and its date has not fired. An older one is missed, never run late. Times are
 * built from the local date, so a slot keeps its hour across a daylight saving change.
 */
export function dueRuns(now: number, lastFired: LastFired): DueRun[] {
  const today = new Date(now);
  const slotOn = (daysBack: number, hour: number, minute: number) =>
    new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - daysBack,
      hour,
      minute,
    ).getTime();
  return SCHEDULED_RUNS.flatMap(({ agent, hour, minute }) => {
    const todays = slotOn(0, hour, minute);
    const at = todays <= now ? todays : slotOn(1, hour, minute);
    const date = localDate(at);
    return now - at < CATCH_UP_MS && lastFired[agent] !== date ? [{ agent, date }] : [];
  });
}

interface SlotRun<I> {
  body: I;
  hasWork(ex: Executor, now: number): boolean;
  /** Why the slot is skipped when hasWork is false. */
  idle: string;
}

/**
 * What each slot starts, and the agent's own check for an empty run: the Planner fails with
 * nothing_valid when no task is ready, the Status updater when no task changed in its window.
 */
const SLOT_RUNS: { planner: SlotRun<PlannerInput>; status_updater: SlotRun<StatusUpdaterInput> } = {
  planner: {
    body: {},
    hasWork: (ex, now) => readyCandidates(ex, now) !== undefined,
    idle: 'no open task is ready to start',
  },
  status_updater: {
    body: { scope: 'since' },
    hasWork: (ex, now) => loadStatusScope(ex, { scope: 'since' }, now).rows.length > 0,
    idle: 'no task changed in the last 24 hours',
  },
};

const firedKey = (agent: ScheduledAgent) => `lastScheduledRun:${agent}` as const;

/**
 * Starts the daily runs of SCHEDULED_RUNS through the run service, as the manual endpoints do.
 * A slot fires at most once per local date: its date is saved in the transaction that inserts
 * the run row, so a second tick or a restart finds it.
 */
export function createScheduler(deps: {
  db: Db;
  runs: Pick<AgentRunService, 'start'>;
  now?: () => number;
}) {
  const { db, runs, now = () => Date.now() } = deps;
  let timer: NodeJS.Timeout | undefined;
  /** The skip last logged per agent, so a slot that stays skipped logs once, not every tick. */
  const logged = new Map<ScheduledAgent, string>();

  function lastFired(): LastFired {
    return Object.fromEntries(
      SCHEDULED_RUNS.map(({ agent }) => [agent, getSetting(db, firedKey(agent))]),
    );
  }

  function markFired(ex: Executor, { agent, date }: DueRun): void {
    setSetting(ex, firedKey(agent), date);
  }

  /** AI off and the setting off leave the slot open, so turning either on can still run it. */
  function skip(run: DueRun, reason: string, forGood: boolean): void {
    if (forGood) markFired(db, run);
    const line = `Skipped the scheduled ${run.agent} run for ${run.date}: ${reason}`;
    if (logged.get(run.agent) !== line) logger.info(line);
    logged.set(run.agent, line);
  }

  function fire(run: DueRun, at: number): void {
    const settings = readSettings(db);
    if (!settings.aiEnabled) return skip(run, 'AI is off', false);
    if (!settings.scheduledRunsEnabled) return skip(run, 'daily runs are off in Settings', false);
    const slot = SLOT_RUNS[run.agent];
    if (!slot.hasWork(db, at)) return skip(run, slot.idle, true);
    try {
      // start() inserts the run row on this connection before it returns, inside this transaction.
      const { runId } = db.transaction((tx) => {
        const started = runs.start(run.agent, slot.body, 'scheduled');
        markFired(tx, run);
        return started;
      });
      logger.info(`Started the scheduled ${run.agent} run #${runId} for ${run.date}`);
    } catch (err) {
      // 409: a run of the agent is in progress. It covers today's slot.
      if (!(err instanceof AppError && err.status === 409)) throw err;
      skip(run, err.message, true);
    }
  }

  function tick(): void {
    const at = now();
    for (const run of dueRuns(at, lastFired())) {
      try {
        fire(run, at);
      } catch (err) {
        logger.error(`The scheduled ${run.agent} run for ${run.date} did not start`, { err });
      }
    }
  }

  return {
    tick,
    start(): void {
      if (timer) return;
      timer = setInterval(tick, SCHEDULER_TICK_MS).unref();
      const slots = SCHEDULED_RUNS.map((s) => `${s.agent} at ${pad(s.hour)}:${pad(s.minute)}`);
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      logger.info(`Daily runs: ${slots.join(', ')}, ${zone} time`);
    },
    stop(): void {
      clearInterval(timer);
      timer = undefined;
    },
  };
}

export type Scheduler = ReturnType<typeof createScheduler>;
