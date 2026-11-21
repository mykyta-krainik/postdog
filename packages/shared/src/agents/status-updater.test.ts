import { describe, expect, it } from "vitest";
import {
  askForNotesInputSchema,
  statusUpdaterInputSchema,
  statusUpdaterOutputSchema,
  statusUpdaterRunSchema,
  submitStatusUpdateInputSchema,
} from "@postdog/shared";

describe("statusUpdaterInputSchema", () => {
  it("accepts a task scope with a tone and notes", () => {
    const input = {
      scope: "task",
      taskId: 12,
      tone: "heads_up",
      notes: [{ taskId: 12, body: "Waiting on review" }],
    };
    expect(statusUpdaterInputSchema.parse(input)).toEqual(input);
  });

  it("accepts a since scope with no date, leaving the default to the server", () => {
    expect(statusUpdaterInputSchema.parse({ scope: "since" })).toEqual({ scope: "since" });
  });

  it("rejects a task scope without a task id and an unknown scope", () => {
    expect(statusUpdaterInputSchema.safeParse({ scope: "task" }).success).toBe(false);
    expect(statusUpdaterInputSchema.safeParse({ scope: "week" }).success).toBe(false);
    expect(statusUpdaterInputSchema.safeParse({ taskId: 12 }).success).toBe(false);
  });

  it("drops a task id given with the since scope", () => {
    expect(statusUpdaterInputSchema.parse({ scope: "since", taskId: 12 })).toEqual({
      scope: "since",
    });
  });

  it("trims note bodies and rejects an empty one", () => {
    const parse = (body: string) =>
      statusUpdaterInputSchema.safeParse({ scope: "since", notes: [{ taskId: 1, body }] });
    expect(parse("  Shipped  ").data).toEqual({
      scope: "since",
      notes: [{ taskId: 1, body: "Shipped" }],
    });
    expect(parse("  ").success).toBe(false);
  });
});

describe("submitStatusUpdateInputSchema", () => {
  const base = { tone: "neutral", toneReason: "Steady progress", headline: "Login work moving" };

  it("defaults every list to empty", () => {
    expect(submitStatusUpdateInputSchema.parse(base)).toEqual({
      ...base,
      done: [],
      inProgress: [],
      blockers: [],
      next: [],
    });
  });

  it("accepts a 120-character headline and rejects 121", () => {
    const parse = (headline: string) =>
      submitStatusUpdateInputSchema.safeParse({ ...base, headline }).success;
    expect(parse("a".repeat(120))).toBe(true);
    expect(parse("a".repeat(121))).toBe(false);
  });

  it("allows at most 3 next steps", () => {
    const parse = (next: string[]) =>
      submitStatusUpdateInputSchema.safeParse({ ...base, next }).success;
    expect(parse(["a", "b", "c"])).toBe(true);
    expect(parse(["a", "b", "c", "d"])).toBe(false);
  });

  it("bounds item text and rejects an unknown tone", () => {
    const parse = (input: object) =>
      submitStatusUpdateInputSchema.safeParse({ ...base, ...input }).success;
    expect(
      parse({ blockers: [{ taskId: 3, text: "Waiting on API keys", ask: "Who owns them?" }] }),
    ).toBe(true);
    expect(parse({ done: [{ taskId: 3, text: "a".repeat(201) }] })).toBe(false);
    expect(parse({ done: [{ taskId: 3, text: " " }] })).toBe(false);
    expect(parse({ tone: "angry" })).toBe(false);
  });

  it("allows at most 15 items in a list", () => {
    const items = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ taskId: i + 1, text: "x" }));
    expect(
      submitStatusUpdateInputSchema.safeParse({ ...base, inProgress: items(15) }).success,
    ).toBe(true);
    expect(
      submitStatusUpdateInputSchema.safeParse({ ...base, inProgress: items(16) }).success,
    ).toBe(false);
  });
});

describe("askForNotesInputSchema", () => {
  it("accepts 1 to 10 task ids and rejects 0 and 11", () => {
    const parse = (n: number) =>
      askForNotesInputSchema.safeParse({
        taskIds: Array.from({ length: n }, (_, i) => i + 1),
        question: "What changed?",
      }).success;
    expect(parse(1)).toBe(true);
    expect(parse(10)).toBe(true);
    expect(parse(0)).toBe(false);
    expect(parse(11)).toBe(false);
  });
});

const update = {
  kind: "update",
  update: {
    tone: "celebrate",
    toneReason: "Most work finished",
    headline: "Login shipped",
    done: [{ taskId: 12, identifier: "PD-12", text: "Fixed login" }],
    inProgress: [],
    blockers: [{ taskId: 3, identifier: "PD-3", text: "Waiting on keys", ask: "Who owns them?" }],
    next: ["Start on signup"],
  },
  warnings: [{ taskId: 5, message: "PD-5 is not done, moved it to in progress" }],
  text: "*Login shipped* :tada:\n• PD-12 Fixed login",
};

describe("statusUpdaterOutputSchema", () => {
  it("accepts an update and a request for notes", () => {
    expect(statusUpdaterOutputSchema.parse(update)).toEqual(update);
    const needsNotes = {
      kind: "needs_notes",
      tasks: [
        { taskId: 3, identifier: "PD-3", title: "Fix login" },
        { taskId: 4, identifier: "PD-4", title: "Add export" },
      ],
      question: "What changed?",
    };
    expect(statusUpdaterOutputSchema.parse(needsNotes)).toEqual(needsNotes);
  });

  it("rejects mismatched kinds and items without identifiers", () => {
    expect(statusUpdaterOutputSchema.safeParse({ ...update, kind: "needs_notes" }).success).toBe(
      false,
    );
    expect(
      statusUpdaterOutputSchema.safeParse({ kind: "update", tasks: [], question: "?" }).success,
    ).toBe(false);
    const bare = { ...update, update: { ...update.update, done: [{ taskId: 12, text: "x" }] } };
    expect(statusUpdaterOutputSchema.safeParse(bare).success).toBe(false);
  });
});

describe("statusUpdaterRunSchema", () => {
  const run = {
    id: 11,
    agent: "status_updater",
    mode: null,
    status: "completed",
    promptVersion: "STATUS_UPDATER_PROMPT_V1",
    input: { scope: "since", since: 1_700_000_000_000 },
    output: update,
    trace: [],
    error: null,
    langfuseTraceId: null,
    usage: null,
    llm: { mode: "real", model: "anthropic:claude-sonnet-5-5" },
    startedAt: 1_700_000_000_000,
    finishedAt: 1_700_000_003_000,
  };

  it("types the input and output of a status updater run", () => {
    const parsed = statusUpdaterRunSchema.parse(run);
    expect(parsed.output?.kind).toBe("update");
    expect(parsed.input.scope).toBe("since");
  });

  it("rejects a planner run", () => {
    expect(statusUpdaterRunSchema.safeParse({ ...run, agent: "planner" }).success).toBe(false);
  });
});
