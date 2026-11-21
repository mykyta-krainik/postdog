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
