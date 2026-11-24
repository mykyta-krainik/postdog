import { markNotificationReadResponseSchema, type Notification } from '@postdog/shared';
import { mutate } from 'swr';
import { apiKey, apiRequest } from '@/shared/api';
import { notificationKeys } from './keys';

/** Refetches every mounted notification list and the nav badge. */
export function revalidateNotifications() {
  return mutate(notificationKeys.isNotifications);
}

export async function markNotificationRead(id: number): Promise<Notification> {
  try {
    return await apiRequest(
      apiKey(`/notifications/${id}/read`),
      markNotificationReadResponseSchema,
      { method: 'POST' },
    );
  } finally {
    await revalidateNotifications();
  }
}
