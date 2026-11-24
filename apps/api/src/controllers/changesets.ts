import type { IdParams, RollbackInput, RollbackResponse } from '@postdog/shared';
import type { Request, Response } from 'express';
import type { ChangesetService } from '../services/changesets';

export function createChangesetController(changesets: ChangesetService) {
  return {
    rollback: (req: Request<IdParams, unknown, RollbackInput>, res: Response<RollbackResponse>) => {
      res.json(changesets.rollback(req.params.id, req.body));
    },
  };
}

export type ChangesetController = ReturnType<typeof createChangesetController>;
