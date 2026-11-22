import { z } from "zod";
import { suggestionSchema } from "./agents/suggestions";
import { idSchema, timestampSchema } from "./common";
import { aiStateSchema, prioritySchema, taskStatusSchema } from "./enums";
import { taskDetailLinkSchema } from "./links";

const titleSchema = z.string().trim().min(1).max(200);
const descriptionSchema = z.string().max(10_000);
const countSchema = z.number().int().nonnegative();

export const taskSchema = z.object({
  id: idSchema,
  identifier: z.string(),
  title: z.string(),
  description: z.string(),
  status: taskStatusSchema,
  priority: prioritySchema,
  parentId: idSchema.nullable(),
  aiState: aiStateSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  statusChangedAt: timestampSchema,
});
export type Task = z.infer<typeof taskSchema>;

export const taskListItemSchema = taskSchema.omit({ description: true }).extend({
  subtaskCount: countSchema,
  subtaskDoneCount: countSchema,
  linkCount: countSchema,
});
export type TaskListItem = z.infer<typeof taskListItemSchema>;

export const taskDetailSchema = taskSchema.extend({
  subtasks: z.array(taskListItemSchema),
  links: z.array(taskDetailLinkSchema),
  pendingSuggestions: z.array(suggestionSchema),
});
export type TaskDetail = z.infer<typeof taskDetailSchema>;

export const createTaskInputSchema = z.object({
  title: titleSchema,
  description: descriptionSchema.default(""),
  status: taskStatusSchema.default("todo"),
  priority: prioritySchema.default("medium"),
  parentId: idSchema.optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskInputSchema>;

export const updateTaskInputSchema = z
  .object({
    title: titleSchema,
    description: descriptionSchema,
    status: taskStatusSchema,
    priority: prioritySchema,
  })
  .partial();
export type UpdateTaskInput = z.infer<typeof updateTaskInputSchema>;

export const createSubtasksInputSchema = z.object({
  subtasks: z
    .array(createTaskInputSchema.pick({ title: true, description: true, priority: true }))
    .min(1)
    .max(20),
  baseUpdatedAt: timestampSchema,
});
export type CreateSubtasksInput = z.infer<typeof createSubtasksInputSchema>;

export const taskSortSchema = z.enum(["priority", "createdAt"]);
export type TaskSort = z.infer<typeof taskSortSchema>;

export const sortOrderSchema = z.enum(["asc", "desc"]);
export type SortOrder = z.infer<typeof sortOrderSchema>;

export const listTasksQuerySchema = z.object({
  status: taskStatusSchema.optional(),
  sort: taskSortSchema.default("createdAt"),
  order: sortOrderSchema.default("desc"),
  parentId: z.coerce.number().int().positive().optional(),
  q: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((q) => q || undefined),
});
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;

export const listTasksResponseSchema = z.object({
  items: z.array(taskListItemSchema),
});
export type ListTasksResponse = z.infer<typeof listTasksResponseSchema>;
