import { z } from 'zod';
import { idSchema, timestampSchema } from '../common';
import { taskStatusSchema } from '../enums';

export const getTaskInputSchema = z.object({
  id: idSchema.describe('The numeric task id, such as 12 for PD-12.'),
});
export type GetTaskInput = z.infer<typeof getTaskInputSchema>;

export const searchTasksInputSchema = z.object({
  query: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .describe('Words to match in task titles and descriptions.'),
  status: taskStatusSchema.optional().describe('Only return tasks with this status.'),
  limit: z.number().int().min(1).max(50).default(10).describe('Maximum number of tasks to return.'),
});
export type SearchTasksInput = z.infer<typeof searchTasksInputSchema>;

export const getTaskNotesInputSchema = z.object({
  taskId: idSchema.describe('The numeric task id.'),
  since: timestampSchema
    .optional()
    .describe('Only return notes created at or after this time, in ms since the epoch.'),
  limit: z.number().int().min(1).max(50).default(20).describe('Maximum number of notes to return.'),
});
export type GetTaskNotesInput = z.infer<typeof getTaskNotesInputSchema>;
