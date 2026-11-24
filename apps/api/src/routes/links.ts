import { createLinkInputSchema, idParamsSchema } from '@postdog/shared';
import { Router } from 'express';
import type { LinkController } from '../controllers/links';
import { validate } from '../middleware/validate';

export function linkRoutes(links: LinkController): Router {
  const byId = { params: idParamsSchema };
  return Router()
    .post('/tasks/:id/links', validate({ ...byId, body: createLinkInputSchema }), links.create)
    .delete('/links/:id', validate(byId), links.remove);
}
