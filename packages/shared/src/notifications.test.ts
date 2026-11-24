import { describe, expect, it } from 'vitest';
import {
  listNotificationsQuerySchema,
  listNotificationsResponseSchema,
  notificationSchema,
  type Notification,
} from '@postdog/shared';

const notification: Notification = {
  id: 3,
  kind: 'auto_decomposition',
  title: 'Split 2 tasks into 5 subtasks',
  body: 'Linked 1 related group.',
  runId: 9,
  changesetId: 1,
  changeset: {
    id: 1,
    runId: 9,
    status: 'applied',
    createdAt: 1_000,
    tasks: [
      {
        taskId: 12,
        identifier: 'PD-12',
        title: 'Add SSO',
        createdSubtasks: 3,
        createdLinks: 1,
        state: 'applied',
      },
    ],
    counts: { subtasks: 3, links: 1 },
  },
  readAt: null,
  createdAt: 1_000,
};

describe('notificationSchema', () => {
  it('accepts an auto decomposition with its changeset summary', () => {
    expect(notificationSchema.parse(notification)).toEqual(notification);
  });

  it('accepts a notification with no run and no changeset', () => {
    const conflict = {
      ...notification,
      kind: 'conflict',
      runId: null,
      changesetId: null,
      changeset: null,
    };
    expect(notificationSchema.parse(conflict)).toEqual(conflict);
  });

  it('rejects an unknown kind and a missing changeset field', () => {
    expect(notificationSchema.safeParse({ ...notification, kind: 'digest' }).success).toBe(false);
    const withoutChangeset = { ...notification, changeset: undefined };
    expect(notificationSchema.safeParse(withoutChangeset).success).toBe(false);
  });
});

describe('listNotificationsQuerySchema', () => {
  it('lists every notification, 50 at most, by default', () => {
    expect(listNotificationsQuerySchema.parse({})).toEqual({ unread: false, limit: 50 });
  });

  it('parses unread and limit from the query string', () => {
    expect(listNotificationsQuerySchema.parse({ unread: 'true', limit: '10' })).toEqual({
      unread: true,
      limit: 10,
    });
    expect(listNotificationsQuerySchema.parse({ unread: 'false' }).unread).toBe(false);
  });

  it('rejects a limit outside 1 to 100 and an unread that is not a boolean', () => {
    const parse = (query: object) => listNotificationsQuerySchema.safeParse(query).success;
    expect([parse({ limit: '0' }), parse({ limit: '100' }), parse({ limit: '101' })]).toEqual([
      false,
      true,
      false,
    ]);
    expect(parse({ unread: 'maybe' })).toBe(false);
  });
});

describe('listNotificationsResponseSchema', () => {
  it('carries the unread count next to the items', () => {
    const response = { items: [notification], unreadCount: 1 };
    expect(listNotificationsResponseSchema.parse(response)).toEqual(response);
    expect(listNotificationsResponseSchema.safeParse({ items: [] }).success).toBe(false);
  });
});
