import { idParamsSchema, rollbackInputSchema } from '@postdog/shared';
import { Router } from 'express';
import type { ChangesetController } from '../controllers/changesets';
import { validate } from '../middleware/validate';

/** Not behind aiEnabledGuard, so an undo still works after AI is turned off. No body rolls back everything. */
export function changesetRoutes(changesets: ChangesetController): Router {
  return Router().post(
    '/changesets/:id/rollback',
    validate({ params: idParamsSchema, body: rollbackInputSchema.default({}) }),
    changesets.rollback,
  );
}
