import { describe, expect, it } from 'vitest';
import { insertChangeset, updateChangesetOps } from '../src/repositories/changesets';
import {
  countUnreadNotifications,
  findNotification,
  insertNotification,
  listNotifications,
  markNotificationRead,
  type NewNotification,
} from '../src/repositories/notifications';
import { DAY, addRun, addTask, createTestDb } from './suggestionFixtures';

const NOW = 50 * DAY;

function setup() {
  const db = createTestDb();
  const run = addRun(db);
  const conflict = (createdAt: number): NewNotification => ({
    kind: 'conflict',
    title: 'PD-7 was skipped',
    body: 'You edited PD-7 while the Decomposer worked on it.',
    runId: run,
    createdAt,
  });
  return { db, run, conflict };
}

describe('insertNotification', () => {
  it('stores an unread notification with no changeset', () => {
    const { db, run, conflict } = setup();
    const saved = insertNotification(db, conflict(NOW));
    expect(saved).toEqual({
      id: saved.id,
      kind: 'conflict',
      title: 'PD-7 was skipped',
      body: 'You edited PD-7 while the Decomposer worked on it.',
      runId: run,
      changesetId: null,
      changeset: null,
      readAt: null,
      createdAt: NOW,
    });
    expect(findNotification(db, saved.id)).toEqual(saved);
    expect(findNotification(db, saved.id + 1)).toBeUndefined();
  });

  it('stores a notification with no run, and an empty body by default', () => {
    const { db } = setup();
    const saved = insertNotification(db, { kind: 'agent_failed', title: 'Failed', createdAt: NOW });
    expect(saved).toMatchObject({ runId: null, changesetId: null, body: '' });
  });

  it('embeds the changeset summary of an auto decomposition, as it is now', () => {
    const { db, run } = setup();
    const task = addTask(db, { title: 'Add SSO' });
    const sub = addTask(db, { title: 'Write the migration', parentId: task.id });
    const changeset = insertChangeset(db, {
      runId: run,
      ops: [{ type: 'create_task', id: sub.id, taskId: task.id }],
      now: NOW,
    });
    const saved = insertNotification(db, {
      kind: 'auto_decomposition',
      title: 'Split 1 task into 1 subtask',
      body: '',
      runId: run,
      changesetId: changeset.id,
      createdAt: NOW,
    });

    expect(saved.changeset).toEqual({
      id: changeset.id,
      runId: run,
      status: 'applied',
      createdAt: NOW,
      tasks: [
        {
          taskId: task.id,
          identifier: task.identifier,
          title: 'Add SSO',
          createdSubtasks: 1,
          createdLinks: 0,
          state: 'applied',
        },
      ],
      counts: { subtasks: 1, links: 0 },
    });

    updateChangesetOps(db, changeset.id, [{ ...changeset.ops[0]!, state: 'rolled_back' }]);
    expect(findNotification(db, saved.id)?.changeset).toMatchObject({
      status: 'rolled_back',
      tasks: [{ taskId: task.id, state: 'rolled_back' }],
    });
  });
});

describe('listNotifications', () => {
  it('lists newest first, the later id first on a tie, up to the limit', () => {
    const { db, conflict } = setup();
    const old = insertNotification(db, conflict(NOW - DAY));
    const tieFirst = insertNotification(db, conflict(NOW));
    const tieSecond = insertNotification(db, conflict(NOW));

    const ids = (limit: number) => listNotifications(db, { limit }).map((n) => n.id);
    expect(ids(50)).toEqual([tieSecond.id, tieFirst.id, old.id]);
    expect(ids(2)).toEqual([tieSecond.id, tieFirst.id]);
  });

  it('lists only unread notifications with unread, and counts every unread one', () => {
    const { db, conflict } = setup();
    const read = insertNotification(db, conflict(NOW));
    const unreadOld = insertNotification(db, conflict(NOW + 1));
    const unreadNew = insertNotification(db, conflict(NOW + 2));
    markNotificationRead(db, read.id, NOW + 3);

    const ids = (unread: boolean, limit = 50) =>
      listNotifications(db, { unread, limit }).map((n) => n.id);
    expect(ids(true)).toEqual([unreadNew.id, unreadOld.id]);
    expect(ids(false)).toEqual([unreadNew.id, unreadOld.id, read.id]);
    expect(ids(true, 1)).toEqual([unreadNew.id]);
    expect(countUnreadNotifications(db)).toBe(2);
  });
});

describe('markNotificationRead', () => {
  it('sets readAt once, so reading again keeps the first time', () => {
    const { db, conflict } = setup();
    const saved = insertNotification(db, conflict(NOW));

    expect(markNotificationRead(db, saved.id, NOW + 5)).toEqual({ ...saved, readAt: NOW + 5 });
    expect(markNotificationRead(db, saved.id, NOW + 9)).toEqual({ ...saved, readAt: NOW + 5 });
    expect(countUnreadNotifications(db)).toBe(0);
  });

  it('answers undefined for a notification that does not exist', () => {
    const { db } = setup();
    expect(markNotificationRead(db, 1, NOW)).toBeUndefined();
  });
});
