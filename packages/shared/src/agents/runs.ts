import { z } from 'zod';
import { idSchema, timestampSchema } from '../common';
import {
  agentErrorCodeSchema,
  agentNameSchema,
  decompositionModeSchema,
  llmModeSchema,
  runStatusSchema,
  runTriggerSchema,
  traceStepTypeSchema,
} from '../enums';

const tokenCountSchema = z.number().int().nonnegative();

export const traceStepSchema = z.object({
  step: z.number().int().positive(),
  type: traceStepTypeSchema,
  tool: z.string().optional(),
  input: z.string(),
  outputSummary: z.string(),
  durationMs: z.number().int().nonnegative(),
  tokens: z.object({ input: tokenCountSchema, output: tokenCountSchema }).optional(),
});
export type TraceStep = z.infer<typeof traceStepSchema>;

export const agentRunErrorSchema = z.object({
  code: agentErrorCodeSchema,
  message: z.string(),
});
export type AgentRunError = z.infer<typeof agentRunErrorSchema>;

export const agentUsageSchema = z.object({
  inputTokens: tokenCountSchema,
  outputTokens: tokenCountSchema,
});
export type AgentUsage = z.infer<typeof agentUsageSchema>;

export const llmInfoSchema = z.object({
  mode: llmModeSchema,
  model: z.string(),
});
export type LlmInfo = z.infer<typeof llmInfoSchema>;

export const agentWarningSchema = z.object({
  taskId: idSchema.optional(),
  message: z.string().trim().min(1).max(300),
});
export type AgentWarning = z.infer<typeof agentWarningSchema>;

export const agentRunSchema = z.object({
  id: idSchema,
  agent: agentNameSchema,
  mode: decompositionModeSchema.nullable(),
  status: runStatusSchema,
  trigger: runTriggerSchema.default('manual'),
  promptVersion: z.string(),
  input: z.unknown(),
  output: z.unknown().nullable(),
  trace: z.array(traceStepSchema),
  error: agentRunErrorSchema.nullable(),
  langfuseTraceId: z.string().nullable(),
  usage: agentUsageSchema.nullable(),
  llm: llmInfoSchema,
  startedAt: timestampSchema,
  finishedAt: timestampSchema.nullable(),
});
export type AgentRun = z.infer<typeof agentRunSchema>;

/** One line for run lists: what the run was for, such as "Plan my day" or "Status update for PD-7". */
export const agentRunSummarySchema = agentRunSchema
  .omit({ input: true, output: true, trace: true })
  .extend({ label: z.string() });
export type AgentRunSummary = z.infer<typeof agentRunSummarySchema>;

export const startRunResponseSchema = z.object({
  runId: idSchema,
});
export type StartRunResponse = z.infer<typeof startRunResponseSchema>;

export const listAgentRunsQuerySchema = z.object({
  agent: agentNameSchema.optional(),
  status: runStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListAgentRunsQuery = z.infer<typeof listAgentRunsQuerySchema>;

export const listAgentRunsResponseSchema = z.object({
  items: z.array(agentRunSummarySchema),
});
export type ListAgentRunsResponse = z.infer<typeof listAgentRunsResponseSchema>;

export const agentsInfoSchema = z.object({
  llm: llmInfoSchema,
});
export type AgentsInfo = z.infer<typeof agentsInfoSchema>;
