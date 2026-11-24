import type { CreateLinkInput, TaskLink } from '@postdog/shared';
import type { Db } from '../db/client';
import { conflict, invalidField, notFound } from '../lib/errors';
import { deleteLink, findLink, insertLink } from '../repositories/links';
import { findTask } from '../repositories/tasks';

export function createLinkService(db: Db) {
  return {
    create(fromTaskId: number, input: CreateLinkInput): TaskLink {
      const { toTaskId, type } = input;
      return db.transaction((tx) => {
        if (!findTask(tx, fromTaskId)) throw notFound(`Task ${fromTaskId} not found`);
        if (toTaskId === fromTaskId) throw invalidField('toTaskId', 'A task cannot link to itself');
        if (!findTask(tx, toTaskId)) {
          throw invalidField('toTaskId', `Task ${toTaskId} does not exist`);
        }
        const existing =
          findLink(tx, fromTaskId, toTaskId, type) ??
          (type === 'relates' ? findLink(tx, toTaskId, fromTaskId, type) : undefined);
        if (existing) throw conflict(`These tasks already have a ${type} link`);

        return insertLink(tx, {
          fromTaskId,
          toTaskId,
          type,
          createdBy: 'user',
          createdAt: Date.now(),
        });
      });
    },

    remove(id: number): void {
      if (!deleteLink(db, id)) throw notFound(`Link ${id} not found`);
    },
  };
}

export type LinkService = ReturnType<typeof createLinkService>;
