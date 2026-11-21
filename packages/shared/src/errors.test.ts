import { describe, expect, it } from "vitest";
import { apiErrorBodySchema, validationErrorDetailsSchema } from "@postdog/shared";

describe("apiErrorBodySchema", () => {
  it("accepts an error without details", () => {
    const body = { error: { code: "not_found", message: "Task 42 not found" } };
    expect(apiErrorBodySchema.parse(body)).toEqual(body);
  });

  it("accepts a validation error with issue details", () => {
    const details = { issues: [{ path: "subtasks.0.title", message: "Too small" }] };
    const body = { error: { code: "validation_error", message: "Invalid request", details } };
    const parsed = apiErrorBodySchema.parse(body);
    expect(validationErrorDetailsSchema.parse(parsed.error.details)).toEqual(details);
  });

  it("accepts every spec error code", () => {
    const codes = [
      "validation_error",
      "not_found",
      "conflict",
      "stale",
      "ai_disabled",
      "agent_failed",
      "step_limit",
      "internal_error",
    ];
    for (const code of codes) {
      expect(apiErrorBodySchema.safeParse({ error: { code, message: "m" } }).success).toBe(true);
    }
  });

  it("rejects an unknown code, a missing message and a flat body", () => {
    expect(apiErrorBodySchema.safeParse({ error: { code: "teapot", message: "m" } }).success).toBe(
      false,
    );
    expect(apiErrorBodySchema.safeParse({ error: { code: "not_found" } }).success).toBe(false);
    expect(apiErrorBodySchema.safeParse({ code: "not_found", message: "m" }).success).toBe(false);
  });
});
