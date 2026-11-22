import { z } from "zod";
import { distinctIdsSchema, idSchema, timestampSchema } from "../common";
import { AGENT_LIMITS } from "../config";
import {
  relatedRelationSchema,
  skipReasonSchema,
  suggestionStatusSchema,
  suggestionTargetTypeSchema,
} from "../enums";
import { taskLinkSchema } from "../links";
import { taskSchema } from "../tasks";
import { agentRunSchema, agentWarningSchema } from "./runs";
import {
  clarificationPayloadSchema,
  relatedPayloadSchema,
  subtasksPayloadSchema,
  suggestionSchema,
} from "./suggestions";

const countSchema = z.number().int().nonnegative();

export const reportRelatedInputSchema = z.object({
  groups: z
    .array(relatedPayloadSchema)
    .max(10)
    .describe("Groups of related tasks. An empty list when no tasks in the batch are related."),
});
export type ReportRelatedInput = z.infer<typeof reportRelatedInputSchema>;

export const proposeSubtasksInputSchema = subtasksPayloadSchema;
export type ProposeSubtasksInput = z.infer<typeof proposeSubtasksInputSchema>;

export const askClarificationInputSchema = clarificationPayloadSchema;
export type AskClarificationInput = z.infer<typeof askClarificationInputSchema>;

export const skipInputSchema = z.object({
  reason: skipReasonSchema.describe(
    "already_atomic when the task is one step already; not_actionable when it is not work to do, such as a note or an open question.",
  ),
  explanation: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .describe("One or two sentences on why the task gets no subtasks."),
});
export type SkipInput = z.infer<typeof skipInputSchema>;

export const decomposerRunInputSchema = z.object({
  taskIds: distinctIdsSchema(1, AGENT_LIMITS.maxDecomposerTasksPerRun).optional(),
});
export type DecomposerRunInput = z.infer<typeof decomposerRunInputSchema>;

const clarificationAnswerSchema = z.object({
  question: z.string().trim().min(1).max(300),
  answer: z.string().trim().min(1).max(1000),
});
export type ClarificationAnswer = z.infer<typeof clarificationAnswerSchema>;

export const clarifyInputSchema = z
  .object({
    suggestionId: idSchema,
    answers: z.array(clarificationAnswerSchema).min(1).max(3).optional(),
    generateAnyway: z.boolean().optional(),
  })
  .refine((input) => (input.answers !== undefined) !== (input.generateAnyway === true), {
    message: "Send either answers or generateAnyway: true, not both and not neither",
    path: ["answers"],
  });
export type ClarifyInput = z.infer<typeof clarifyInputSchema>;

export const listSuggestionsQuerySchema = z.object({
  targetType: suggestionTargetTypeSchema.optional(),
  targetId: z.coerce.number().int().positive().optional(),
  status: suggestionStatusSchema.default("pending"),
});
export type ListSuggestionsQuery = z.infer<typeof listSuggestionsQuerySchema>;

export const listSuggestionsResponseSchema = z.object({
  items: z.array(suggestionSchema),
});
export type ListSuggestionsResponse = z.infer<typeof listSuggestionsResponseSchema>;

export const acceptSuggestionInputSchema = z.object({
  payload: z.unknown().optional(),
  baseUpdatedAt: timestampSchema,
});
export type AcceptSuggestionInput = z.infer<typeof acceptSuggestionInputSchema>;

export const acceptSuggestionResponseSchema = z.object({
  suggestion: suggestionSchema,
  createdTasks: z.array(taskSchema),
  createdLinks: z.array(taskLinkSchema),
});
export type AcceptSuggestionResponse = z.infer<typeof acceptSuggestionResponseSchema>;

export const rejectSuggestionResponseSchema = suggestionSchema;
export type RejectSuggestionResponse = z.infer<typeof rejectSuggestionResponseSchema>;

export const DECOMPOSER_OUTCOMES = [
  // propose_subtasks passed validation; a pending subtasks suggestion was saved.
  "suggested_subtasks",
  // Auto mode: propose_subtasks passed validation, the subtasks were created and recorded in
  // the run's changeset, and the subtasks suggestion was saved as applied.
  "applied_subtasks",
  // ask_clarification; a pending clarification suggestion was saved.
  "needs_clarification",
  // skip, or validation dropped every proposed subtask (duplicates of existing ones).
  "skipped",
  // Stage 1 put the task in a duplicates group, so stage 2 left it out.
  "duplicate",
  // Another run held the task's claim, so this run left it alone.
  "claimed",
  // The user edited the task during the run; its suggestion was saved as superseded.
  "superseded",
  // The task's loop failed (a limit, a model error or nothing valid); detail says why.
  "failed",
] as const;
export const decomposerOutcomeSchema = z.enum(DECOMPOSER_OUTCOMES);
export type DecomposerOutcome = z.infer<typeof decomposerOutcomeSchema>;

export const decomposerTaskResultSchema = z.object({
  taskId: idSchema,
  identifier: z.string(),
  title: z.string(),
  outcome: decomposerOutcomeSchema,
  suggestionId: idSchema.nullable(),
  detail: z.string(),
});
export type DecomposerTaskResult = z.infer<typeof decomposerTaskResultSchema>;

export const decomposerRelatedResultSchema = z.object({
  suggestionId: idSchema,
  relation: relatedRelationSchema,
  taskIds: z.array(idSchema),
  /** Auto mode linked the group and saved its suggestion as applied. */
  applied: z.boolean().default(false),
});
export type DecomposerRelatedResult = z.infer<typeof decomposerRelatedResultSchema>;

export const decomposerOutputSchema = z.object({
  tasks: z.array(decomposerTaskResultSchema),
  related: z.array(decomposerRelatedResultSchema),
  /** The auto run's changeset, null when the run created nothing. */
  changesetId: idSchema.nullable().default(null),
  counts: z.object({
    considered: countSchema,
    suggestedSubtasks: countSchema,
    /** Tasks with the outcome applied_subtasks. */
    appliedSubtasks: countSchema.default(0),
    /** Subtasks created across those tasks. */
    createdSubtasks: countSchema.default(0),
    /** relates links created for overlaps groups. */
    appliedLinks: countSchema.default(0),
    needsClarification: countSchema,
    skipped: countSchema,
    duplicates: countSchema,
    claimed: countSchema,
    superseded: countSchema,
    failed: countSchema,
  }),
  warnings: z.array(agentWarningSchema),
});
export type DecomposerOutput = z.infer<typeof decomposerOutputSchema>;

export const decomposerRunSchema = agentRunSchema.extend({
  agent: z.literal("decomposer"),
  output: decomposerOutputSchema.nullable(),
});
export type DecomposerRun = z.infer<typeof decomposerRunSchema>;
