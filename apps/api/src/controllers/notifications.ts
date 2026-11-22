import type {
  IdParams,
  ListNotificationsQuery,
  ListNotificationsResponse,
  MarkNotificationReadResponse,
} from "@postdog/shared";
import type { Request, Response } from "express";
import type { NotificationService } from "../services/notifications";

export function createNotificationController(notifications: NotificationService) {
  return {
    list: (
      req: Request<unknown, unknown, unknown, ListNotificationsQuery>,
      res: Response<ListNotificationsResponse>,
    ) => {
      res.json(notifications.list(req.query));
    },
    markRead: (req: Request<IdParams>, res: Response<MarkNotificationReadResponse>) => {
      res.json(notifications.markRead(req.params.id));
    },
  };
}

export type NotificationController = ReturnType<typeof createNotificationController>;
