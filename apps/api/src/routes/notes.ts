import { createNoteInputSchema, idParamsSchema } from '@postdog/shared';
import { Router } from 'express';
import type { NoteController } from '../controllers/notes';
import { validate } from '../middleware/validate';

export function noteRoutes(notes: NoteController): Router {
  const byId = { params: idParamsSchema };
  return Router()
    .get('/tasks/:id/notes', validate(byId), notes.list)
    .post('/tasks/:id/notes', validate({ ...byId, body: createNoteInputSchema }), notes.create);
}
