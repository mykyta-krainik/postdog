import type { CreateLinkInput, IdParams, TaskLink } from "@postdog/shared";
import type { Request, Response } from "express";
import type { LinkService } from "../services/links";

export function createLinkController(links: LinkService) {
  return {
    create: (req: Request<IdParams, unknown, CreateLinkInput>, res: Response<TaskLink>) => {
      res.status(201).json(links.create(req.params.id, req.body));
    },
    remove: (req: Request<IdParams>, res: Response) => {
      links.remove(req.params.id);
      res.status(204).end();
    },
  };
}

export type LinkController = ReturnType<typeof createLinkController>;
