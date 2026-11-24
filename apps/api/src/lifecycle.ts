import type { Server } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import type { Express } from 'express';
import type { Tracer } from './agents/core/tracer';
import type { Db } from './db/client';
import { logger } from './lib/logger';
import type { Scheduler } from './scheduler';
import { reconcileInterruptedRuns, type AgentRunService } from './services/agentRuns';

export const SHUTDOWN_TIMEOUT_MS = 5_000;

/**
 * Listens, then fails the runs an earlier process left running and starts the daily runs. Only a
 * process that holds its port does either, so a second start on a busy port (EADDRINUSE) rejects
 * before it touches the runs or the schedule of the process that is still serving.
 */
export function listen(
  app: Express,
  db: Db,
  { host, port }: { host: string; port: number },
  scheduler?: Pick<Scheduler, 'start'>,
): Promise<{ server: Server; interrupted: number }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, (err?: Error) => {
      if (err) return reject(err);
      const interrupted = reconcileInterruptedRuns(db);
      scheduler?.start();
      resolve({ server, interrupted });
    });
  });
}

export interface Running {
  server: Server;
  runs: Pick<AgentRunService, 'interruptActive'>;
  tracer: Pick<Tracer, 'flush'>;
  db: Db;
  scheduler?: Pick<Scheduler, 'stop'>;
}

/**
 * Stops the daily runs and taking requests, fails this process's runs and waits for each to save
 * its end, flushes the traces, then closes the database. After `timeoutMs` it drops open
 * connections and closes the database anyway, so a stuck step cannot hang the exit.
 */
export async function shutdown(
  { server, runs, tracer, db, scheduler }: Running,
  timeoutMs = SHUTDOWN_TIMEOUT_MS,
): Promise<'clean' | 'timed_out'> {
  scheduler?.stop();
  const closed = new Promise<void>((resolve) => server.close(() => resolve()));
  server.closeIdleConnections();
  const work = (async () => {
    await runs.interruptActive();
    await tracer.flush().catch((err: unknown) => logger.error('Langfuse flush failed', { err }));
    await closed;
    return 'clean' as const;
  })();
  const result = await Promise.race([work, delay(timeoutMs, 'timed_out' as const, { ref: false })]);
  if (result === 'timed_out') server.closeAllConnections();
  db.$client.close();
  return result;
}
