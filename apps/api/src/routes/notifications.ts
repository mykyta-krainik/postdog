import { idParamsSchema, listNotificationsQuerySchema } from '@postdog/shared';
import { Router } from 'express';
import type { NotificationController } from '../controllers/notifications';
import { validate } from '../middleware/validate';

/** Not behind aiEnabledGuard: the client hides the Inbox when AI is off. */
export function notificationRoutes(notifications: NotificationController): Router {
  return Router()
    .get('/notifications', validate({ query: listNotificationsQuerySchema }), notifications.list)
    .post('/notifications/:id/read', validate({ params: idParamsSchema }), notifications.markRead);
}
