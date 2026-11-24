import { z } from 'zod';
import { idSchema, timestampSchema } from '../common';
import { aiStateSchema, prioritySchema, taskStatusSchema } from '../enums';
import { agentRunSchema, agentWarningSchema } from './runs';

const countSchema = z.number().int().nonnegative();

export const plannerInputSchema = z.object({});
export type PlannerInput = z.infer<typeof plannerInputSchema>;

export const plannerContextRowSchema = z.object({
  id: idSchema,
  identifier: z.string(),
  title: z.string(),
  status: taskStatusSchema,
  priority: prioritySchema,
  ageDays: countSchema,
  daysInStatus: countSchema,
  subtaskDone: countSchema,
  subtaskTotal: countSchema,
  blocksOpenCount: countSchema,
  isBlocked: z.boolean(),
  aiState: aiStateSchema,
});
export type PlannerContextRow = z.infer<typeof plannerContextRowSchema>;

const focusItemSchema = z.object({
  taskId: idSchema.describe('The numeric id of a task from the candidate table.'),
  reason: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .describe('One or two sentences on why this task comes first today.'),
  signals: z
    .array(z.string().trim().min(1).max(60))
    .max(5)
    .describe('Short facts behind the choice, such as "in progress 6 days" or "unblocks 2".'),
});

export const submitDailyPlanInputSchema = z.object({
  focus: z.array(focusItemSchema).min(1).max(5).describe('1 to 5 tasks, most important first.'),
  warnings: z
    .array(agentWarningSchema)
    .default([])
    .describe('Problems the user should know about, tied to a task when there is one.'),
  coordinationNotes: z
    .array(z.string().trim().min(1).max(300))
    .max(5)
    .default([])
    .describe('Notes about tasks other agents are working on or that await review.'),
});
export type SubmitDailyPlanInput = z.infer<typeof submitDailyPlanInputSchema>;

export const plannerFocusItemSchema = focusItemSchema.extend({
  identifier: z.string(),
  title: z.string(),
});
export type PlannerFocusItem = z.infer<typeof plannerFocusItemSchema>;

export const plannerOutputSchema = z.object({
  focus: z.array(plannerFocusItemSchema).min(1).max(5),
  warnings: z.array(agentWarningSchema),
  coordinationNotes: z.array(z.string()),
});
export type PlannerOutput = z.infer<typeof plannerOutputSchema>;

export const plannerRunSchema = agentRunSchema.extend({
  agent: z.literal('planner'),
  input: plannerInputSchema,
  output: plannerOutputSchema.nullable(),
});
export type PlannerRun = z.infer<typeof plannerRunSchema>;

export const completedPlannerRunSchema = plannerRunSchema.extend({
  status: z.literal('completed'),
  output: plannerOutputSchema,
  finishedAt: timestampSchema,
});
export type CompletedPlannerRun = z.infer<typeof completedPlannerRunSchema>;

export const plannerLatestResponseSchema = z.object({
  latest: z
    .object({
      run: completedPlannerRunSchema,
      changedSince: countSchema,
    })
    .nullable(),
});
export type PlannerLatestResponse = z.infer<typeof plannerLatestResponseSchema>;
