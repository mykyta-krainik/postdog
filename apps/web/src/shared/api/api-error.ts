import {
  apiErrorBodySchema,
  validationErrorDetailsSchema,
  type ErrorCode,
  type ValidationErrorDetails,
} from "@postdog/shared";

/** Codes the client produces itself, when there is no contract error body to read. */
export type ClientErrorCode = "network_error" | "unexpected_response";

export class ApiError extends Error {
  override readonly name = "ApiError";

  constructor(
    readonly status: number,
    readonly code: ErrorCode | ClientErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

const UNREACHABLE_STATUSES = new Set([500, 502, 503, 504]);

/** Builds an ApiError from a failed response. A body outside the contract usually means the API is down. */
export function apiErrorFromBody(status: number, body: unknown): ApiError {
  const parsed = apiErrorBodySchema.safeParse(body);
  if (parsed.success) {
    const { code, message, details } = parsed.data.error;
    return new ApiError(status, code, message, details);
  }
  if (UNREACHABLE_STATUSES.has(status)) {
    return new ApiError(status, "network_error", "Postdog can't reach the API.");
  }
  return new ApiError(
    status,
    "unexpected_response",
    `The API answered ${status} in an unknown format.`,
  );
}

/** Field issues of a validation_error. Each path is also the React Hook Form field name. */
export function getValidationIssues(error: unknown): ValidationErrorDetails["issues"] {
  if (!(error instanceof ApiError) || error.code !== "validation_error") return [];
  const details = validationErrorDetailsSchema.safeParse(error.details);
  return details.success ? details.data.issues : [];
}

/** SWR retries only when the request might succeed later: the network or the server failed. */
export function isRetryableError(error: unknown): boolean {
  return !(error instanceof ApiError) || error.code === "network_error" || error.status >= 500;
}
