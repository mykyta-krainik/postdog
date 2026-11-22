import { z } from "zod";
import { distinctIdsSchema, idSchema, timestampSchema } from "../common";
import { AGENT_LIMITS } from "../config";
import { prioritySchema, relatedRelationSchema, suggestionStatusSchema } from "../enums";

const shortTextSchema = z.string().trim().min(1).max(300);
const longTextSchema = z.string().trim().min(1).max(1000);

export const subtaskProposalSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe('A short imperative title, such as "Add the rate limit middleware".'),
  description: z
    .string()
    .max(10_000)
    .default("")
    .describe("What done looks like for this subtask, in markdown. May be empty."),
  priority: prioritySchema.optional().describe("low, medium or high. Leave it out for medium."),
});
export type SubtaskProposal = z.infer<typeof subtaskProposalSchema>;

export const subtasksPayloadSchema = z.object({
  subtasks: z
    .array(subtaskProposalSchema)
    .min(2)
    .max(AGENT_LIMITS.maxSubtasks)
    .describe("2 to 8 subtasks that together finish the task, in the order to do them."),
  rationale: longTextSchema.describe(
    "Why this split, in one to three sentences. Name any team convention you followed.",
  ),
});
export type SubtasksPayload = z.infer<typeof subtasksPayloadSchema>;

export const clarificationPayloadSchema = z.object({
  questions: z
    .array(shortTextSchema)
    .min(1)
    .max(3)
    .describe("1 to 3 short questions whose answers would make the task clear enough to split."),
  whatIsUnclear: longTextSchema.describe(
    "What the task is missing: a clear outcome, a clear scope or both.",
  ),
});
export type ClarificationPayload = z.infer<typeof clarificationPayloadSchema>;

export const relatedPayloadSchema = z.object({
  relation: relatedRelationSchema.describe(
    "duplicates when the tasks describe the same work; overlaps when they share part of it.",
  ),
  taskIds: distinctIdsSchema(2, AGENT_LIMITS.maxDecomposerTasksPerRun).describe(
    "The numeric ids of the 2 or more tasks in the group.",
  ),
  reason: shortTextSchema.describe("One or two sentences on what the tasks have in common."),
});
export type RelatedPayload = z.infer<typeof relatedPayloadSchema>;

export const suggestionPayloadSchemas = {
  subtasks: subtasksPayloadSchema,
  clarification: clarificationPayloadSchema,
  related: relatedPayloadSchema,
} as const;
export type SuggestionPayloadKind = keyof typeof suggestionPayloadSchemas;
export type SuggestionPayload<K extends SuggestionPayloadKind = SuggestionPayloadKind> = z.infer<
  (typeof suggestionPayloadSchemas)[K]
>;

export function parseSuggestionPayload<K extends SuggestionPayloadKind>(
  kind: K,
  payload: unknown,
): z.ZodSafeParseResult<SuggestionPayload<K>> {
  return suggestionPayloadSchemas[kind].safeParse(payload) as z.ZodSafeParseResult<
    SuggestionPayload<K>
  >;
}

const suggestionBaseSchema = z.object({
  id: idSchema,
  runId: idSchema,
  targetType: z.literal("task"),
  targetId: idSchema,
  status: suggestionStatusSchema,
  createdAt: timestampSchema,
  resolvedAt: timestampSchema.nullable(),
});

export const suggestionSchema = z.discriminatedUnion("kind", [
  suggestionBaseSchema.extend({ kind: z.literal("subtasks"), payload: subtasksPayloadSchema }),
  suggestionBaseSchema.extend({
    kind: z.literal("clarification"),
    payload: clarificationPayloadSchema,
  }),
  suggestionBaseSchema.extend({ kind: z.literal("related"), payload: relatedPayloadSchema }),
]);
export type Suggestion = z.infer<typeof suggestionSchema>;
