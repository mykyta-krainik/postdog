import { afterEach, describe, expect, it, vi } from 'vitest';
import { findLink, insertLink } from '../src/repositories/links';
import { findTask } from '../src/repositories/tasks';
import {
  isUntouchedLink,
  isUntouchedSubtask,
  linkKeptReason,
  subtaskKeptReason,
} from '../src/services/rollbackRules';
import { createTaskService, insertSubtasks } from '../src/services/tasks';
import { setNow } from './helpers';
import { DAY, addTask, createTestDb } from './suggestionFixtures';

const NOW = 50 * DAY;

afterEach(() => {
  vi.useRealTimers();
});

/** A subtask created the way auto mode creates one, then read back as the rollback would. */
function setup() {
  const db = createTestDb();
  const parent = addTask(db, { title: 'Add SSO' });
  const [created] = insertSubtasks(
    db,
    parent.id,
    [{ title: 'Write the migration', description: '' }],
    NOW,
  );
  const service = createTaskService(db);
  const current = () => findTask(db, created!.id);
  return { db, parent, id: created!.id, service, current };
}

describe('subtaskKeptReason', () => {
  it('lets the rollback delete a subtask nobody touched', () => {
    const { current } = setup();
    expect(subtaskKeptReason(current(), 0)).toBeNull();
    expect(isUntouchedSubtask(current(), 0)).toBe(true);
  });

  it('keeps a subtask the user edited', () => {
    const { id, service, current } = setup();
    setNow(NOW + 1_000);
    service.update(id, { title: 'Write the migration and the backfill' });
    expect(subtaskKeptReason(current(), 0)).toBe('edited');
    expect(isUntouchedSubtask(current(), 0)).toBe(false);
  });

  it('keeps a subtask whose status changed, also when it changed back to todo', () => {
    const { id, service, current } = setup();
    setNow(NOW + 1_000);
    service.update(id, { status: 'in_progress' });
    expect(subtaskKeptReason(current(), 0)).toBe('status_changed');
    setNow(NOW + 2_000);
    service.update(id, { status: 'todo' });
    expect(subtaskKeptReason(current(), 0)).toBe('status_changed');
  });

  it('keeps a subtask that has subtasks of its own', () => {
    const { current } = setup();
    expect(subtaskKeptReason(current(), 1)).toBe('has_children');
    expect(isUntouchedSubtask(current(), 1)).toBe(false);
    expect(subtaskKeptReason(current(), 0, 1, 1)).toBe('has_notes');
    expect(subtaskKeptReason(current(), 0, 0, 1)).toBe('has_links');
    expect(isUntouchedSubtask(current(), 0, 0, 1)).toBe(false);
  });

  it('reports a subtask that is already gone as not_found', () => {
    const { service, parent, current } = setup();
    service.remove(parent.id);
    expect(current()).toBeUndefined();
    expect(subtaskKeptReason(current(), 0)).toBe('not_found');
  });
});

describe('linkKeptReason', () => {
  it('lets the rollback delete a link that still exists, and reports a deleted one', () => {
    const { db, parent } = setup();
    const other = addTask(db, { title: 'Audit log' });
    const row = { fromTaskId: parent.id, toTaskId: other.id, type: 'relates' as const };
    insertLink(db, { ...row, createdBy: 'agent:1', createdAt: NOW });
    const link = () => findLink(db, row.fromTaskId, row.toTaskId, row.type);

    expect(linkKeptReason(link())).toBeNull();
    expect(isUntouchedLink(link())).toBe(true);
    createTaskService(db).remove(other.id);
    expect(linkKeptReason(link())).toBe('not_found');
    expect(isUntouchedLink(link())).toBe(false);
  });
});
