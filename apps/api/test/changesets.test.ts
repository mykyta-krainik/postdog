import type { ChangesetOp, TaskDetail } from '@postdog/shared';
import { describe, expect, it } from 'vitest';
import {
  appendChangesetOps,
  findChangeset,
  findChangesetByRun,
  insertChangeset,
  summarizeChangeset,
  updateChangesetOps,
} from '../src/repositories/changesets';
import { insertLink } from '../src/repositories/links';
import { deleteTask } from '../src/repositories/tasks';
import { DAY, addRun, addTask, createTestDb } from './suggestionFixtures';

const NOW = 50 * DAY;

function setup() {
  const db = createTestDb();
  const run = addRun(db);
  const parent = (title: string) => addTask(db, { title });
  const subtasksOf = (task: TaskDetail, n: number) =>
    Array.from({ length: n }, (_, i) => addTask(db, { title: `Step ${i + 1}`, parentId: task.id }));
  const link = (from: TaskDetail, to: TaskDetail) =>
    insertLink(db, {
      fromTaskId: from.id,
      toTaskId: to.id,
      type: 'relates',
      createdBy: `agent:${run}`,
      createdAt: NOW,
    });
  return { db, run, parent, subtasksOf, link };
}

describe('insertChangeset', () => {
  it('records every op as applied and reads back the same changeset', () => {
    const { db, run, parent, subtasksOf } = setup();
    const task = parent('Add SSO');
    const [first, second] = subtasksOf(task, 2) as [TaskDetail, TaskDetail];

    const saved = insertChangeset(db, {
      runId: run,
      ops: [
        { type: 'create_task', id: first.id, taskId: task.id },
        { type: 'create_task', id: second.id, taskId: task.id },
      ],
      now: NOW,
    });

    expect(saved).toEqual({
      id: saved.id,
      runId: run,
      ops: [
        { type: 'create_task', id: first.id, taskId: task.id, state: 'applied' },
        { type: 'create_task', id: second.id, taskId: task.id, state: 'applied' },
      ],
      status: 'applied',
      createdAt: NOW,
    });
    expect(findChangeset(db, saved.id)).toEqual(saved);
    expect(findChangesetByRun(db, run)).toEqual(saved);
    expect(findChangeset(db, saved.id + 1)).toBeUndefined();
    expect(findChangesetByRun(db, run + 1)).toBeUndefined();
  });

  it('allows one changeset per run', () => {
    const { db, run } = setup();
    insertChangeset(db, { runId: run, ops: [], now: NOW });
    expect(() => insertChangeset(db, { runId: run, ops: [], now: NOW })).toThrow();
  });
});

describe('appendChangesetOps', () => {
  it("creates the run's changeset on the first call and appends to it after", () => {
    const { db, run, parent, subtasksOf } = setup();
    const a = parent('A');
    const b = parent('B');
    const [subA] = subtasksOf(a, 1) as [TaskDetail];
    const [subB] = subtasksOf(b, 1) as [TaskDetail];

    const first = appendChangesetOps(db, {
      runId: run,
      ops: [{ type: 'create_task', id: subA.id, taskId: a.id }],
      now: NOW,
    });
    const second = appendChangesetOps(db, {
      runId: run,
      ops: [{ type: 'create_task', id: subB.id, taskId: b.id }],
      now: NOW + 1,
    });

    expect(second.id).toBe(first.id);
    expect(second.createdAt).toBe(NOW);
    expect(second.ops.map((op) => [op.id, op.state])).toEqual([
      [subA.id, 'applied'],
      [subB.id, 'applied'],
    ]);
    expect(findChangesetByRun(db, run)).toEqual(second);
  });
});

describe('updateChangesetOps', () => {
  it('stores the ops with the status they imply', () => {
    const { db, run } = setup();
    const op = (id: number, state: ChangesetOp['state']): ChangesetOp => ({
      type: 'create_task',
      id,
      taskId: 1,
      state,
    });
    const { id } = insertChangeset(db, { runId: run, ops: [], now: NOW });

    expect(updateChangesetOps(db, id, [op(2, 'rolled_back'), op(3, 'applied')])?.status).toBe(
      'partially_rolled_back',
    );
    expect(updateChangesetOps(db, id, [op(2, 'rolled_back'), op(3, 'kept')])?.status).toBe(
      'partially_rolled_back',
    );
    const done = updateChangesetOps(db, id, [op(2, 'rolled_back'), op(3, 'rolled_back')]);
    expect(done?.status).toBe('rolled_back');
    expect(findChangeset(db, id)).toEqual(done);
    expect(updateChangesetOps(db, id + 1, [])).toBeUndefined();
  });
});

describe('summarizeChangeset', () => {
  it("lists each task's part with its derived state, lowest task id first", () => {
    const { db, run, parent, subtasksOf, link } = setup();
    const sso = parent('Add SSO');
    const audit = parent('Audit log');
    const billing = parent('Billing page');
    const search = parent('Search filters');
    const gone = parent('Old idea');
    const [sso1, sso2] = subtasksOf(sso, 2) as [TaskDetail, TaskDetail];
    const [audit1, audit2] = subtasksOf(audit, 2) as [TaskDetail, TaskDetail];
    const [billing1, billing2] = subtasksOf(billing, 2) as [TaskDetail, TaskDetail];
    const [search1] = subtasksOf(search, 1) as [TaskDetail];
    const [gone1, gone2] = subtasksOf(gone, 2) as [TaskDetail, TaskDetail];
    const ssoLink = link(sso, search);

    const changeset = insertChangeset(db, {
      runId: run,
      ops: [
        { type: 'create_task', id: search1.id, taskId: search.id },
        { type: 'create_task', id: sso1.id, taskId: sso.id },
        { type: 'create_task', id: sso2.id, taskId: sso.id },
        { type: 'create_link', id: ssoLink.id, taskId: sso.id },
        { type: 'create_task', id: audit1.id, taskId: audit.id },
        { type: 'create_task', id: audit2.id, taskId: audit.id },
        { type: 'create_task', id: billing1.id, taskId: billing.id },
        { type: 'create_task', id: billing2.id, taskId: billing.id },
        { type: 'create_task', id: gone1.id, taskId: gone.id },
        { type: 'create_task', id: gone2.id, taskId: gone.id },
      ],
      now: NOW,
    });
    const stateOf: Record<number, ChangesetOp['state']> = {
      [audit1.id]: 'rolled_back',
      [audit2.id]: 'rolled_back',
      [billing1.id]: 'rolled_back',
      [billing2.id]: 'kept',
      [search1.id]: 'kept',
    };
    const updated = updateChangesetOps(
      db,
      changeset.id,
      changeset.ops.map((op) =>
        op.type === 'create_task' ? { ...op, state: stateOf[op.id] ?? op.state } : op,
      ),
    )!;
    deleteTask(db, gone.id);

    expect(summarizeChangeset(db, updated)).toEqual({
      id: changeset.id,
      runId: run,
      status: 'partially_rolled_back',
      createdAt: NOW,
      tasks: [
        {
          taskId: sso.id,
          identifier: sso.identifier,
          title: 'Add SSO',
          createdSubtasks: 2,
          createdLinks: 1,
          state: 'applied',
        },
        {
          taskId: audit.id,
          identifier: audit.identifier,
          title: 'Audit log',
          createdSubtasks: 2,
          createdLinks: 0,
          state: 'rolled_back',
        },
        {
          taskId: billing.id,
          identifier: billing.identifier,
          title: 'Billing page',
          createdSubtasks: 2,
          createdLinks: 0,
          state: 'partially_rolled_back',
        },
        {
          taskId: search.id,
          identifier: search.identifier,
          title: 'Search filters',
          createdSubtasks: 1,
          createdLinks: 0,
          state: 'kept',
        },
        {
          taskId: gone.id,
          identifier: null,
          title: null,
          createdSubtasks: 2,
          createdLinks: 0,
          state: 'applied',
        },
      ],
      counts: { subtasks: 9, links: 1 },
    });
  });

  it('summarizes an empty changeset', () => {
    const { db, run } = setup();
    const changeset = insertChangeset(db, { runId: run, ops: [], now: NOW });
    expect(summarizeChangeset(db, changeset)).toMatchObject({
      status: 'applied',
      tasks: [],
      counts: { subtasks: 0, links: 0 },
    });
  });
});
