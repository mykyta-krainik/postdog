import { ApiError, getValidationIssues } from "@/shared/api";

/** The message to show for a failed request. ApiError messages are written for people. */
export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

/**
 * Shows a failed request on a React Hook Form form. Each validation issue goes on the field that
 * `fieldFor` maps its API path to. When no issue lands on a field, the form gets one root message.
 */
export function setApiErrors<Field extends string>(
  form: { setError: (name: Field | "root", error: { message?: string }) => void },
  error: unknown,
  fieldFor: (path: string) => Field | undefined,
  fallback: string,
): void {
  let placed = false;
  for (const issue of getValidationIssues(error)) {
    const field = fieldFor(issue.path);
    if (!field) continue;
    form.setError(field, { message: issue.message });
    placed = true;
  }
  if (!placed) form.setError("root", { message: errorMessage(error, fallback) });
}
