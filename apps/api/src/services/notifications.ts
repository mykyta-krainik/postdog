import type {
  ListNotificationsQuery,
  ListNotificationsResponse,
  Notification,
} from '@postdog/shared';
import type { Db } from '../db/client';
import { notFound } from '../lib/errors';
import {
  countUnreadNotifications,
  listNotifications,
  markNotificationRead,
} from '../repositories/notifications';

export function createNotificationService(db: Db) {
  return {
    list(query: ListNotificationsQuery): ListNotificationsResponse {
      return {
        items: listNotifications(db, query),
        unreadCount: countUnreadNotifications(db),
      };
    },

    /** Reading it again keeps the first readAt. */
    markRead(id: number): Notification {
      const notification = markNotificationRead(db, id, Date.now());
      if (!notification) throw notFound(`Notification ${id} not found`);
      return notification;
    },
  };
}

export type NotificationService = ReturnType<typeof createNotificationService>;
