import type { CreateNoteInput, IdParams, ListNotesResponse, TaskNote } from "@postdog/shared";
import type { Request, Response } from "express";
import type { NoteService } from "../services/notes";

export function createNoteController(notes: NoteService) {
  return {
    list: (req: Request<IdParams>, res: Response<ListNotesResponse>) => {
      res.json({ items: notes.list(req.params.id) });
    },
    create: (req: Request<IdParams, unknown, CreateNoteInput>, res: Response<TaskNote>) => {
      res.status(201).json(notes.create(req.params.id, req.body));
    },
  };
}

export type NoteController = ReturnType<typeof createNoteController>;
