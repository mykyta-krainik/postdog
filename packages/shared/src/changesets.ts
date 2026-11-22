import { z } from "zod";
import { idSchema, timestampSchema } from "./common";
import {
  changesetOpStateSchema,
  changesetOpTypeSchema,
  changesetStatusSchema,
  changesetTaskStateSchema,
  rollbackKeptReasonSchema,
  type ChangesetOpState,
  type ChangesetStatus,
  type ChangesetTaskState,
} from "./enums";

const countSchema = z.number().int().nonnegative();

export const changesetOpSchema = z.object({
  type: changesetOpTypeSchema,
  /** The created task or link. */
  id: idSchema,
  /** The parent of a created subtask, or the lowest task id of a linked group. */
  taskId: idSchema,
  state: changesetOpStateSchema,
});
export type ChangesetOp = z.infer<typeof changesetOpSchema>;

export const changesetSchema = z.object({
  id: idSchema,
  runId: idSchema,
  ops: z.array(changesetOpSchema),
  status: changesetStatusSchema,
  createdAt: timestampSchema,
});
export type Changeset = z.infer<typeof changesetSchema>;

export const changesetTaskSummarySchema = z.object({
  taskId: idSchema,
  identifier: z.string().nullable(),
  title: z.string().nullable(),
  createdSubtasks: countSchema,
  createdLinks: countSchema,
  state: changesetTaskStateSchema,
});
export type ChangesetTaskSummary = z.infer<typeof changesetTaskSummarySchema>;

export const changesetSummarySchema = z.object({
  id: idSchema,
  runId: idSchema,
  status: changesetStatusSchema,
  createdAt: timestampSchema,
  tasks: z.array(changesetTaskSummarySchema),
  counts: z.object({ subtasks: countSchema, links: countSchema }),
});
export type ChangesetSummary = z.infer<typeof changesetSummarySchema>;

type OpStates = readonly Pick<ChangesetOp, "state">[];

function countStates(ops: OpStates) {
  const count = (state: ChangesetOpState) => ops.filter((op) => op.state === state).length;
  return { applied: count("applied"), rolledBack: count("rolled_back"), total: ops.length };
}

/** One task's part, from the states of its ops. See the package README. */
export function changesetTaskStateOf(ops: OpStates): ChangesetTaskState {
  const { applied, rolledBack, total } = countStates(ops);
  if (applied === total) return "applied";
  if (rolledBack === total) return "rolled_back";
  if (rolledBack === 0) return "kept";
  return "partially_rolled_back";
}

/** The whole changeset, from the states of all its ops. */
export function changesetStatusOf(ops: OpStates): ChangesetStatus {
  const { applied, rolledBack, total } = countStates(ops);
  if (applied === total) return "applied";
  if (rolledBack === total) return "rolled_back";
  return "partially_rolled_back";
}

export const rollbackInputSchema = z.object({
  taskId: idSchema.optional(),
});
export type RollbackInput = z.infer<typeof rollbackInputSchema>;

export const rollbackKeptItemSchema = z.object({
  type: changesetOpTypeSchema,
  id: idSchema,
  taskId: idSchema,
  identifier: z.string().nullable(),
  title: z.string().nullable(),
  reason: rollbackKeptReasonSchema,
});
export type RollbackKeptItem = z.infer<typeof rollbackKeptItemSchema>;

export const rollbackResponseSchema = z.object({
  changeset: changesetSummarySchema,
  deleted: z.object({ tasks: countSchema, links: countSchema }),
  kept: z.array(rollbackKeptItemSchema),
  message: z.string(),
});
export type RollbackResponse = z.infer<typeof rollbackResponseSchema>;
