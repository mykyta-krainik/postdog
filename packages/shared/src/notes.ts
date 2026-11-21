import { z } from "zod";
import { idSchema, timestampSchema } from "./common";

export const createNoteInputSchema = z.object({
  body: z.string().trim().min(1).max(5000),
});
export type CreateNoteInput = z.infer<typeof createNoteInputSchema>;

export const taskNoteSchema = z.object({
  id: idSchema,
  taskId: idSchema,
  body: z.string(),
  createdAt: timestampSchema,
});
export type TaskNote = z.infer<typeof taskNoteSchema>;

export const listNotesResponseSchema = z.object({
  items: z.array(taskNoteSchema),
});
export type ListNotesResponse = z.infer<typeof listNotesResponseSchema>;
