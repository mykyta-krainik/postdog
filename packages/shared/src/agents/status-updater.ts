import { z } from "zod";
import { idSchema, timestampSchema } from "../common";
import { AGENT_LIMITS } from "../config";
import { statusUpdateToneSchema } from "../enums";
import { createNoteInputSchema } from "../notes";
import { agentRunSchema, agentWarningSchema } from "./runs";

const textSchema = z.string().trim().min(1).max(200);
const maxItems = AGENT_LIMITS.maxStatusUpdateTasks;

const noteSchema = z.object({
  taskId: idSchema,
  body: createNoteInputSchema.shape.body,
});

const scopeOptionsSchema = z.object({
  tone: statusUpdateToneSchema.optional(),
  notes: z.array(noteSchema).max(maxItems).optional(),
});

export const statusUpdaterInputSchema = z.discriminatedUnion("scope", [
  scopeOptionsSchema.extend({
    scope: z.literal("task"),
    taskId: idSchema,
  }),
  scopeOptionsSchema.extend({
    scope: z.literal("since"),
    since: timestampSchema.optional(),
  }),
]);
export type StatusUpdaterInput = z.infer<typeof statusUpdaterInputSchema>;

const itemSchema = z.object({
  taskId: idSchema.describe("The numeric id of a task in scope."),
  text: textSchema.describe("One plain line about this task."),
});

const blockerSchema = itemSchema.extend({
  ask: textSchema.optional().describe("A concrete ask that would unblock the task."),
});

export const submitStatusUpdateInputSchema = z.object({
  tone: statusUpdateToneSchema,
  toneReason: textSchema.describe("Why the facts call for this tone."),
  headline: z.string().trim().min(1).max(120).describe("One line that sums up the update."),
  done: z
    .array(itemSchema)
    .max(maxItems)
    .default([])
    .describe("Finished work. Only tasks whose status is done."),
  inProgress: z.array(itemSchema).max(maxItems).default([]).describe("Work still in progress."),
  blockers: z
    .array(blockerSchema)
    .max(maxItems)
    .default([])
    .describe("Blocked or stuck work, each with an ask when there is one."),
  next: z.array(textSchema).max(3).default([]).describe("Up to 3 next steps."),
});
export type SubmitStatusUpdateInput = z.infer<typeof submitStatusUpdateInputSchema>;

export const askForNotesInputSchema = z.object({
  taskIds: z
    .array(idSchema)
    .min(1)
    .max(10)
    .describe("Tasks with too little activity in the window to report on."),
  question: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .describe("What the user should write in a one-line note."),
});
export type AskForNotesInput = z.infer<typeof askForNotesInputSchema>;

const outputItemSchema = z.object({
  taskId: idSchema,
  identifier: z.string(),
  text: z.string(),
});

export const statusUpdateSchema = z.object({
  tone: statusUpdateToneSchema,
  toneReason: z.string(),
  headline: z.string(),
  done: z.array(outputItemSchema),
  inProgress: z.array(outputItemSchema),
  blockers: z.array(outputItemSchema.extend({ ask: z.string().optional() })),
  next: z.array(z.string()),
});
export type StatusUpdate = z.infer<typeof statusUpdateSchema>;

export const statusUpdaterOutputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("update"),
    update: statusUpdateSchema,
    warnings: z.array(agentWarningSchema),
    text: z.string(),
  }),
  z.object({
    kind: z.literal("needs_notes"),
    taskIds: z.array(idSchema).min(1),
    question: z.string(),
  }),
]);
export type StatusUpdaterOutput = z.infer<typeof statusUpdaterOutputSchema>;

export const statusUpdaterRunSchema = agentRunSchema.extend({
  agent: z.literal("status_updater"),
  input: statusUpdaterInputSchema,
  output: statusUpdaterOutputSchema.nullable(),
});
export type StatusUpdaterRun = z.infer<typeof statusUpdaterRunSchema>;
