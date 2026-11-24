import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listNotesResponseSchema, type TaskDetail } from '@postdog/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { bootDatabase } from '../src/db/boot';
import type { Db } from '../src/db/client';
import { findRun } from '../src/repositories/agentRuns';
import { listActiveClaims, tryClaim } from '../src/repositories/claims';
import { insertSuggestion } from '../src/repositories/suggestions';
import { updateTask } from '../src/repositories/tasks';
import { reconcileInterruptedRuns } from '../src/services/agentRuns';
import { type Api, createTask, getTask, jsonClient, listTasks } from './helpers';
import {
  addRun,
  addTask,
  aiStateOf,
  clarificationFor,
  relatedOf,
  subtasksFor,
} from './suggestionFixtures';

const DAY = 24 * 60 * 60 * 1000;

let dir: string;
const open: Db[] = [];
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'postdog-boot-'));
});
afterEach(() => {
  for (const db of open.splice(0)) db.$client.close();
  rmSync(dir, { recursive: true, force: true });
});

function boot(path: string, now?: number): Api {
  const { db } = bootDatabase(path, now);
  open.push(db);
  return jsonClient(createApp(db));
}

function closeAll(): void {
  for (const db of open.splice(0)) db.$client.close();
}

async function allTasks(api: Api): Promise<TaskDetail[]> {
  const top = await listTasks(api);
  const children = await Promise.all(
    top.filter((t) => t.subtaskCount > 0).map((t) => listTasks(api, `?parentId=${t.id}`)),
  );
  return Promise.all([...top, ...children.flat()].map((t) => getTask(api, t.id)));
}

describe('fresh start', () => {
  it('creates the missing directory and file, migrates and seeds', async () => {
    const path = join(dir, 'nested', 'data', 'postdog.db');
    const api = boot(path);
    expect(existsSync(path)).toBe(true);
    expect((await listTasks(api)).length).toBeGreaterThan(10);
    expect((await api.get('/api/settings').expect(200)).body).toEqual({
      aiEnabled: true,
      decompositionMode: 'suggest',
      scheduledRunsEnabled: true,
    });
  });

  it('does not seed again on a second boot', async () => {
    const path = join(dir, 'postdog.db');
    const before = (await allTasks(boot(path))).map((t) => t.identifier);
    closeAll();

    const api = boot(path);
    expect((await allTasks(api)).map((t) => t.identifier)).toEqual(before);
    expect((await createTask(api)).identifier).toBe(`PD-${before.length + 1}`);
  });

  it('does not bring the seed back after every task is deleted', async () => {
    const path = join(dir, 'postdog.db');
    let api = boot(path);
    for (const task of await listTasks(api)) {
      await api.delete(`/api/tasks/${task.id}`).expect(204);
    }
    closeAll();

    api = boot(path);
    expect(await listTasks(api)).toEqual([]);
  });
});

describe('crash reconciliation', () => {
  it('leaves the runs alone when it only opens the database, as db:seed and a second start do', () => {
    const path = join(dir, 'postdog.db');
    const first = bootDatabase(path);
    const live = addRun(first.db);
    open.push(first.db);

    const second = bootDatabase(path);
    open.push(second.db);
    expect(findRun(second.db, live)?.status).toBe('running');
  });

  it("fails running runs, drops their claims and rebuilds every task's aiState", () => {
    const path = join(dir, 'postdog.db');
    const now = 50 * DAY;
    const { db } = bootDatabase(path, now);
    const running = addRun(db);
    const finished = addRun(db, 'decomposer', 'completed');
    const [claimed, claimedAndAsked, suggested, grouped, stuck] = Array.from({ length: 5 }, () =>
      addTask(db),
    ) as [TaskDetail, TaskDetail, TaskDetail, TaskDetail, TaskDetail];
    tryClaim(db, claimed.id, running, 'decomposer', now);
    tryClaim(db, claimedAndAsked.id, running, 'decomposer', now);
    insertSuggestion(db, clarificationFor(running, claimedAndAsked.id, now));
    insertSuggestion(db, subtasksFor(finished, suggested.id, now));
    insertSuggestion(db, relatedOf(finished, [suggested.id, grouped.id], now));
    updateTask(db, stuck.id, { aiState: 'processing' });
    db.$client.close();

    const restarted = bootDatabase(path, now + 1_000);
    open.push(restarted.db);
    expect(reconcileInterruptedRuns(restarted.db, now + 1_000)).toBe(1);
    expect(findRun(restarted.db, running)).toMatchObject({
      status: 'failed',
      error: { code: 'interrupted' },
    });
    expect(listActiveClaims(restarted.db, now + 1_000)).toEqual([]);
    expect(
      [claimed, claimedAndAsked, suggested, grouped, stuck].map((t) =>
        aiStateOf(restarted.db, t.id),
      ),
    ).toEqual([
      'none',
      'clarification_pending',
      'suggestion_pending',
      'suggestion_pending',
      'none',
    ]);
  });
});

describe('seed data', () => {
  const now = Date.UTC(2026, 10, 21, 12);

  it('matches the scenarios the agents are built against', async () => {
    const api = boot(join(dir, 'postdog.db'), now);
    const tasks = await allTasks(api);
    const notes = new Map(
      await Promise.all(
        tasks.map(async (t) => {
          const res = await api.get(`/api/tasks/${t.id}/notes`).expect(200);
          return [t.id, listNotesResponseSchema.parse(res.body).items] as const;
        }),
      ),
    );

    expect(tasks.length).toBeGreaterThanOrEqual(22);
    expect(tasks.length).toBeLessThanOrEqual(30);
    expect(new Set(tasks.map((t) => t.status))).toEqual(new Set(['todo', 'in_progress', 'done']));
    expect(new Set(tasks.map((t) => t.priority))).toEqual(new Set(['low', 'medium', 'high']));

    for (const t of tasks) {
      expect(t.createdAt).toBeGreaterThanOrEqual(now - 30 * DAY);
      expect(t.createdAt).toBeLessThanOrEqual(t.statusChangedAt);
      expect(t.statusChangedAt).toBeLessThanOrEqual(t.updatedAt);
      expect(t.updatedAt).toBeLessThanOrEqual(now);
      for (const note of notes.get(t.id) ?? []) {
        expect(note.createdAt).toBeGreaterThanOrEqual(t.createdAt);
      }
    }

    const stuck = tasks.filter(
      (t) => t.status === 'in_progress' && t.statusChangedAt < now - 7 * DAY,
    );
    expect(stuck.length).toBeGreaterThanOrEqual(2);

    const changedAndNoted = tasks.filter(
      (t) =>
        t.updatedAt >= now - DAY && (notes.get(t.id) ?? []).some((n) => n.createdAt >= now - DAY),
    );
    expect(changedAndNoted.length).toBeGreaterThanOrEqual(2);

    expect(
      tasks.filter((t) => t.parentId === null && t.subtasks.length > 0).length,
    ).toBeGreaterThanOrEqual(2);
    expect(new Set(tasks.flatMap((t) => t.links.map((l) => l.type)))).toEqual(
      new Set(['blocks', 'relates', 'duplicates']),
    );
    const byId = new Map(tasks.map((t) => [t.id, t]));
    for (const t of tasks) {
      for (const l of t.links.filter((l) => l.type === 'duplicates' && l.direction === 'out')) {
        expect(t.createdAt).toBeGreaterThan(byId.get(l.task.id)!.createdAt);
      }
    }

    const identifiers = tasks.map((t) => Number(t.identifier.slice(3))).sort((a, b) => a - b);
    expect(identifiers).toEqual(Array.from({ length: tasks.length }, (_, i) => i + 1));
  });
});
