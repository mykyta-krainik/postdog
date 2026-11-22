import { z } from "zod";

export const TASK_STATUSES = ["todo", "in_progress", "done"] as const;
export const taskStatusSchema = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const PRIORITIES = ["low", "medium", "high"] as const;
export const prioritySchema = z.enum(PRIORITIES);
export type Priority = z.infer<typeof prioritySchema>;

export const AI_STATES = [
  "none",
  "suggestion_pending",
  "clarification_pending",
  "processing",
] as const;
export const aiStateSchema = z.enum(AI_STATES);
export type AiState = z.infer<typeof aiStateSchema>;

export const LINK_TYPES = ["blocks", "relates", "duplicates"] as const;
export const linkTypeSchema = z.enum(LINK_TYPES);
export type LinkType = z.infer<typeof linkTypeSchema>;

export const DECOMPOSITION_MODES = ["suggest", "auto"] as const;
export const decompositionModeSchema = z.enum(DECOMPOSITION_MODES);
export type DecompositionMode = z.infer<typeof decompositionModeSchema>;

export const AGENT_NAMES = ["planner", "decomposer", "status_updater", "docs_reviewer"] as const;
export const agentNameSchema = z.enum(AGENT_NAMES);
export type AgentName = z.infer<typeof agentNameSchema>;

export const RUN_STATUSES = ["running", "completed", "failed", "cancelled"] as const;
export const runStatusSchema = z.enum(RUN_STATUSES);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const STATUS_UPDATE_TONES = ["celebrate", "neutral", "heads_up", "blocked"] as const;
export const statusUpdateToneSchema = z.enum(STATUS_UPDATE_TONES);
export type StatusUpdateTone = z.infer<typeof statusUpdateToneSchema>;

/** mark_stale belongs to the Docs reviewer (phase 6) and has no payload schema yet. */
export const SUGGESTION_KINDS = ["subtasks", "clarification", "related", "mark_stale"] as const;
export const suggestionKindSchema = z.enum(SUGGESTION_KINDS);
export type SuggestionKind = z.infer<typeof suggestionKindSchema>;

export const SUGGESTION_STATUSES = [
  "pending",
  "rejected",
  "applied",
  "rolled_back",
  "superseded",
] as const;
export const suggestionStatusSchema = z.enum(SUGGESTION_STATUSES);
export type SuggestionStatus = z.infer<typeof suggestionStatusSchema>;

export const SUGGESTION_TARGET_TYPES = ["task", "doc"] as const;
export const suggestionTargetTypeSchema = z.enum(SUGGESTION_TARGET_TYPES);
export type SuggestionTargetType = z.infer<typeof suggestionTargetTypeSchema>;

export const RELATED_RELATIONS = ["duplicates", "overlaps"] as const;
export const relatedRelationSchema = z.enum(RELATED_RELATIONS);
export type RelatedRelation = z.infer<typeof relatedRelationSchema>;

export const SKIP_REASONS = ["already_atomic", "not_actionable"] as const;
export const skipReasonSchema = z.enum(SKIP_REASONS);
export type SkipReason = z.infer<typeof skipReasonSchema>;

export const TRACE_STEP_TYPES = ["llm", "tool", "validation"] as const;
export const traceStepTypeSchema = z.enum(TRACE_STEP_TYPES);
export type TraceStepType = z.infer<typeof traceStepTypeSchema>;

export const LLM_MODES = ["real", "mock"] as const;
export const llmModeSchema = z.enum(LLM_MODES);
export type LlmMode = z.infer<typeof llmModeSchema>;

export const AGENT_ERROR_CODES = [
  "no_terminal_tool",
  "step_limit",
  "timeout",
  "validation_failed",
  "llm_error",
  "nothing_valid",
  "cancelled",
  "interrupted",
  "ai_disabled",
  "internal_error",
] as const;
export const agentErrorCodeSchema = z.enum(AGENT_ERROR_CODES);
export type AgentErrorCode = z.infer<typeof agentErrorCodeSchema>;
