import { notificationSchema, type Notification } from '@postdog/shared';
import { count, desc, eq, isNull, sql } from 'drizzle-orm';
import type { Executor } from '../db/client';
import { notifications, type NewNotificationRow, type NotificationRow } from '../db/schema';
import { findChangeset, summarizeChangeset } from './changesets';

/** A new notification is always unread. */
export type NewNotification = Omit<NewNotificationRow, 'id' | 'readAt'>;

export interface NotificationListFilter {
  unread?: boolean;
  limit: number;
}

const newestFirst = [desc(notifications.createdAt), desc(notifications.id)];

function toNotification(ex: Executor, row: NotificationRow): Notification {
  const changeset = row.changesetId === null ? undefined : findChangeset(ex, row.changesetId);
  return notificationSchema.parse({
    ...row,
    changeset: changeset ? summarizeChangeset(ex, changeset) : null,
  });
}

export function insertNotification(ex: Executor, row: NewNotification): Notification {
  return toNotification(ex, ex.insert(notifications).values(row).returning().get());
}

export function findNotification(ex: Executor, id: number): Notification | undefined {
  const row = ex.select().from(notifications).where(eq(notifications.id, id)).get();
  return row && toNotification(ex, row);
}

/** Newest first, each with its changeset summary embedded. */
export function listNotifications(ex: Executor, filter: NotificationListFilter): Notification[] {
  return ex
    .select()
    .from(notifications)
    .where(filter.unread ? isNull(notifications.readAt) : undefined)
    .orderBy(...newestFirst)
    .limit(filter.limit)
    .all()
    .map((row) => toNotification(ex, row));
}

export function countUnreadNotifications(ex: Executor): number {
  return (
    ex.select({ n: count() }).from(notifications).where(isNull(notifications.readAt)).get()?.n ?? 0
  );
}

/** Sets readAt once: reading it again keeps the first time. Undefined when it does not exist. */
export function markNotificationRead(
  ex: Executor,
  id: number,
  now: number,
): Notification | undefined {
  const row = ex
    .update(notifications)
    .set({ readAt: sql`coalesce(${notifications.readAt}, ${now})` })
    .where(eq(notifications.id, id))
    .returning()
    .get();
  return row && toNotification(ex, row);
}
