import { z } from "zod";

export const ERROR_CODES = [
  "validation_error",
  "not_found",
  "conflict",
  "stale",
  "ai_disabled",
  "agent_failed",
  "step_limit",
  "internal_error",
] as const;
export const errorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const apiErrorBodySchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;

export const validationErrorDetailsSchema = z.object({
  issues: z.array(
    z.object({
      path: z.string(),
      message: z.string(),
    }),
  ),
});
export type ValidationErrorDetails = z.infer<typeof validationErrorDetailsSchema>;
