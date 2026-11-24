import { z } from 'zod';
import { changesetSummarySchema } from './changesets';
import { idSchema, timestampSchema } from './common';
import { notificationKindSchema } from './enums';

export const notificationSchema = z.object({
  id: idSchema,
  kind: notificationKindSchema,
  title: z.string(),
  body: z.string(),
  runId: idSchema.nullable(),
  changesetId: idSchema.nullable(),
  changeset: changesetSummarySchema.nullable(),
  readAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
});
export type Notification = z.infer<typeof notificationSchema>;

export const listNotificationsQuerySchema = z.object({
  unread: z.stringbool().default(false),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

export const listNotificationsResponseSchema = z.object({
  items: z.array(notificationSchema),
  unreadCount: z.number().int().nonnegative(),
});
export type ListNotificationsResponse = z.infer<typeof listNotificationsResponseSchema>;

export const markNotificationReadResponseSchema = notificationSchema;
export type MarkNotificationReadResponse = z.infer<typeof markNotificationReadResponseSchema>;
