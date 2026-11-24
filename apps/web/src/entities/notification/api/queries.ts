'use client';

import { listNotificationsResponseSchema } from '@postdog/shared';
import useSWR from 'swr';
import { fetcherFor } from '@/shared/api';
import { notificationKeys, type NotificationsQuery } from './keys';

const fetchNotifications = fetcherFor(listNotificationsResponseSchema);

/** How often the nav badge asks for the unread count. */
export const UNREAD_POLL_INTERVAL_MS = 15_000;

/**
 * Notifications, newest first, with the total unread count. Every notification is an AI
 * notification, so pass enabled = aiEnabled.
 */
export function useNotifications(query: NotificationsQuery = {}, enabled = true) {
  return useSWR(enabled ? notificationKeys.list(query) : null, fetchNotifications);
}

/** The unread count for the nav badge, polled and refetched on focus. Undefined until it loads. */
export function useUnreadCount(enabled = true): number | undefined {
  const { data } = useSWR(enabled ? notificationKeys.unreadCount() : null, fetchNotifications, {
    refreshInterval: UNREAD_POLL_INTERVAL_MS,
    revalidateOnFocus: true,
  });
  return data?.unreadCount;
}
