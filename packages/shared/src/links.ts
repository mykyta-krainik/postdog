import { z } from 'zod';
import { idSchema, timestampSchema } from './common';
import { linkTypeSchema, taskStatusSchema } from './enums';

export const linkDirectionSchema = z.enum(['out', 'in']);
export type LinkDirection = z.infer<typeof linkDirectionSchema>;

export const linkCreatedBySchema = z.union([
  z.literal('user'),
  z.templateLiteral(['agent:', z.number().int().positive()]),
]);
export type LinkCreatedBy = z.infer<typeof linkCreatedBySchema>;

export const createLinkInputSchema = z.object({
  toTaskId: idSchema,
  type: linkTypeSchema,
});
export type CreateLinkInput = z.infer<typeof createLinkInputSchema>;

export const taskLinkSchema = z.object({
  id: idSchema,
  fromTaskId: idSchema,
  toTaskId: idSchema,
  type: linkTypeSchema,
  createdBy: linkCreatedBySchema,
  createdAt: timestampSchema,
});
export type TaskLink = z.infer<typeof taskLinkSchema>;

export const taskDetailLinkSchema = z.object({
  id: idSchema,
  type: linkTypeSchema,
  direction: linkDirectionSchema,
  task: z.object({
    id: idSchema,
    identifier: z.string(),
    title: z.string(),
    status: taskStatusSchema,
  }),
});
export type TaskDetailLink = z.infer<typeof taskDetailLinkSchema>;
