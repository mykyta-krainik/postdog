import { describe, expect, it } from "vitest";
import {
  acceptSuggestionInputSchema,
  clarifyInputSchema,
  decomposerOutputSchema,
  decomposerRunInputSchema,
  listSuggestionsQuerySchema,
  reportRelatedInputSchema,
  skipInputSchema,
  type DecomposerOutput,
} from "@postdog/shared";

describe("decomposerRunInputSchema", () => {
  const parse = (taskIds: number[]) => decomposerRunInputSchema.safeParse({ taskIds }).success;

  it("leaves the task choice to the server without taskIds", () => {
    expect(decomposerRunInputSchema.parse({})).toEqual({});
  });

  it("takes 1 to 10 distinct task ids", () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
    expect([parse([]), parse(ids(1)), parse(ids(10)), parse(ids(11))]).toEqual([
      false,
      true,
      true,
      false,
    ]);
    expect(parse([4, 4])).toBe(false);
  });
});

describe("clarifyInputSchema", () => {
  const answers = [{ question: "Which API?", answer: "  The public one  " }];
  const parse = (input: object) => clarifyInputSchema.safeParse({ suggestionId: 3, ...input });

  it("accepts answers, trimmed", () => {
    expect(parse({ answers }).data).toEqual({
      suggestionId: 3,
      answers: [{ question: "Which API?", answer: "The public one" }],
    });
  });

  it("accepts generateAnyway on its own", () => {
    expect(parse({ generateAnyway: true }).success).toBe(true);
  });

  it("rejects both, neither, empty answers and generateAnyway false on its own", () => {
    expect(parse({ answers, generateAnyway: true }).success).toBe(false);
    expect(parse({}).success).toBe(false);
    expect(parse({ answers: [] }).success).toBe(false);
    expect(parse({ generateAnyway: false }).success).toBe(false);
    expect(parse({ answers, generateAnyway: false }).success).toBe(true);
  });

  it("bounds an answer at 1000 characters", () => {
    const answer = (text: string) => parse({ answers: [{ question: "Q?", answer: text }] }).success;
    expect([answer("a".repeat(1000)), answer("a".repeat(1001)), answer("  ")]).toEqual([
      true,
      false,
      false,
    ]);
  });
});

describe("listSuggestionsQuerySchema", () => {
  it("lists pending suggestions by default and coerces the target id", () => {
    expect(listSuggestionsQuerySchema.parse({ targetType: "task", targetId: "12" })).toEqual({
      targetType: "task",
      targetId: 12,
      status: "pending",
    });
    expect(listSuggestionsQuerySchema.parse({ status: "rejected" }).status).toBe("rejected");
  });
});

describe("acceptSuggestionInputSchema", () => {
  it("passes the edited payload through for the kind's schema to check", () => {
    const payload = { anything: true };
    expect(acceptSuggestionInputSchema.parse({ payload, baseUpdatedAt: 5 })).toEqual({
      payload,
      baseUpdatedAt: 5,
    });
    expect(acceptSuggestionInputSchema.safeParse({ payload }).success).toBe(false);
  });
});

describe("Decomposer terminal tools", () => {
  it("report_related takes an empty list and rejects a group of one", () => {
    expect(reportRelatedInputSchema.safeParse({ groups: [] }).success).toBe(true);
    const group = { relation: "duplicates", taskIds: [3], reason: "Same" };
    expect(reportRelatedInputSchema.safeParse({ groups: [group] }).success).toBe(false);
  });

  it("skip takes a known reason and an explanation", () => {
    expect(
      skipInputSchema.safeParse({ reason: "already_atomic", explanation: "One step" }).success,
    ).toBe(true);
    expect(skipInputSchema.safeParse({ reason: "too_hard", explanation: "No" }).success).toBe(
      false,
    );
  });
});

describe("decomposerOutputSchema", () => {
  const output: DecomposerOutput = {
    tasks: [
      {
        taskId: 12,
        identifier: "PD-12",
        title: "Add SSO",
        outcome: "suggested_subtasks",
        suggestionId: 7,
        detail: "Proposed 4 subtasks",
      },
      {
        taskId: 15,
        identifier: "PD-15",
        title: "Improve things",
        outcome: "claimed",
        suggestionId: null,
        detail: "Skipped PD-15: being processed by decomposer run #41",
      },
    ],
    related: [{ suggestionId: 8, relation: "overlaps", taskIds: [12, 15] }],
    counts: {
      considered: 2,
      suggestedSubtasks: 1,
      needsClarification: 0,
      skipped: 0,
      duplicates: 0,
      claimed: 1,
      superseded: 0,
      failed: 0,
    },
    warnings: [{ taskId: 12, message: "Dropped a subtask that already exists" }],
  };

  it("accepts a run summary and rejects an unknown outcome", () => {
    expect(decomposerOutputSchema.parse(output)).toEqual(output);
    const bad = { ...output, tasks: [{ ...output.tasks[0], outcome: "maybe" }] };
    expect(decomposerOutputSchema.safeParse(bad).success).toBe(false);
  });
});
