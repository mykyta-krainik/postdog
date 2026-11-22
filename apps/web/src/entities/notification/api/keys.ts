import { listNotificationsQuerySchema } from "@postdog/shared";
import type { z } from "zod";
import { apiKey, matchesApiPath } from "@/shared/api";

/** What a caller passes to the list endpoint. Every notification, 50 at most, by default. */
export type NotificationsQuery = z.input<typeof listNotificationsQuerySchema>;

export const notificationKeys = {
  /** Normalized through the contract schema, so equal queries share one cache entry. */
  list: (query: NotificationsQuery = {}) =>
    apiKey("/notifications", listNotificationsQuerySchema.parse(query)),
  /** The cheapest list that still answers unreadCount, for the nav badge. */
  unreadCount: () => notificationKeys.list({ unread: "true", limit: 1 }),
  /** Every notification list, the badge's included. */
  isNotifications: (key: unknown) => matchesApiPath(key, "/notifications"),
};
