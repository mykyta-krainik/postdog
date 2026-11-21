import type { ErrorCode, ValidationErrorDetails } from "@postdog/shared";

type ValidationIssue = ValidationErrorDetails["issues"][number];

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export function validationError(issues: ValidationIssue[]): AppError {
  const details: ValidationErrorDetails = { issues };
  return new AppError(400, "validation_error", "Request validation failed", details);
}

/** A rule broken by one field, reported in the same shape as a schema failure. */
export function invalidField(path: string, message: string): AppError {
  return validationError([{ path, message }]);
}

export function notFound(message: string): AppError {
  return new AppError(404, "not_found", message);
}

export function conflict(message: string): AppError {
  return new AppError(409, "conflict", message);
}

export function stale(message: string): AppError {
  return new AppError(409, "stale", message);
}
