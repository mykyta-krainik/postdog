import { describe, expect, it } from 'vitest';
import { notificationKeys } from './keys';

describe('notificationKeys', () => {
  it('normalizes the list query with the contract defaults', () => {
    expect(notificationKeys.list()).toBe('/api/notifications?limit=50&unread=false');
    expect(notificationKeys.list({ limit: 50 })).toBe(notificationKeys.list());
  });

  it('asks for one unread notification for the badge', () => {
    expect(notificationKeys.unreadCount()).toBe('/api/notifications?limit=1&unread=true');
  });

  it('matches every notification list and nothing else', () => {
    expect(notificationKeys.isNotifications(notificationKeys.unreadCount())).toBe(true);
    expect(notificationKeys.isNotifications('/api/notifications/3/read')).toBe(true);
    expect(notificationKeys.isNotifications('/api/tasks')).toBe(false);
  });
});
