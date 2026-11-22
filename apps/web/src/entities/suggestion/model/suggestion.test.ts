import { suggestionSchema, type Suggestion } from "@postdog/shared";
import { describe, expect, it } from "vitest";
import { ApiError } from "@/shared/api";
import { suggestionKeys } from "../api/keys";
import { affectedTaskIds, describeSuggestion } from "./describe";
import { toReviewError } from "./review-error";

const base = {
  id: 5,
  runId: 41,
  targetType: "task",
  targetId: 3,
  status: "pending",
  createdAt: 1,
  resolvedAt: null,
} as const;

const subtasks: Suggestion = suggestionSchema.parse({
  ...base,
  kind: "subtasks",
  payload: {
    subtasks: [{ title: "Write the middleware" }, { title: "Add tests" }, { title: "Docs" }],
    rationale: "Feature tasks get a tests subtask.",
  },
});

const related = (relation: "duplicates" | "overlaps", taskIds: number[]): Suggestion =>
  suggestionSchema.parse({
    ...base,
    kind: "related",
    payload: { relation, taskIds, reason: "Both rework login." },
  });

describe("describeSuggestion", () => {
  it("says what each kind proposes in one line", () => {
    expect(describeSuggestion(subtasks)).toBe("Split into 3 subtasks");
    expect(
      describeSuggestion(
        suggestionSchema.parse({
          ...base,
          kind: "clarification",
          payload: { questions: ["Which API?"], whatIsUnclear: "The scope." },
        }),
      ),
    ).toBe("1 question before splitting");
    expect(describeSuggestion(related("duplicates", [3, 9]))).toBe("Same work as 1 other task");
    expect(describeSuggestion(related("overlaps", [3, 5, 9]))).toBe("Overlaps with 2 other tasks");
  });
});

describe("affectedTaskIds", () => {
  it("is the target, or every task of a related group", () => {
    expect(affectedTaskIds(subtasks)).toEqual([3]);
    expect(affectedTaskIds(related("overlaps", [3, 5, 9]))).toEqual([3, 5, 9]);
  });
});

describe("toReviewError", () => {
  it("explains a stale target with its identifier", () => {
    expect(toReviewError(new ApiError(409, "stale", "baseUpdatedAt differs"), "PD-12")).toEqual({
      kind: "stale",
      message: "PD-12 changed since this was suggested. Reload it, or run the Decomposer again.",
    });
  });

  it("says a suggestion that is no longer pending was handled", () => {
    expect(toReviewError(new ApiError(409, "conflict", "Not pending"), "PD-12")).toEqual({
      kind: "handled",
      message: "Someone already handled this suggestion.",
    });
  });

  it("keeps the API's message for other errors, and has a fallback", () => {
    expect(toReviewError(new ApiError(400, "validation_error", "Title is empty"), "PD-1")).toEqual({
      kind: "failed",
      message: "Title is empty",
    });
    expect(toReviewError(new Error("boom"), "PD-1").kind).toBe("failed");
  });
});

describe("suggestionKeys", () => {
  it("defaults the status to pending, so equal queries share a key", () => {
    expect(suggestionKeys.list({ targetType: "task", targetId: 3 })).toBe(
      suggestionKeys.list({ targetId: 3, targetType: "task", status: "pending" }),
    );
  });

  it("refetches suggestions, task lists and details, but not notes", () => {
    const affected = suggestionKeys.affectedBySuggestions;
    expect(affected(suggestionKeys.list())).toBe(true);
    expect(affected("/api/tasks?order=desc&sort=createdAt")).toBe(true);
    expect(affected("/api/tasks/3")).toBe(true);
    expect(affected("/api/tasks/3/notes")).toBe(false);
    expect(affected("/api/settings")).toBe(false);
  });
});
