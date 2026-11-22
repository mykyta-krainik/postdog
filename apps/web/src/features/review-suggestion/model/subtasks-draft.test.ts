import type { SubtasksPayload } from "@postdog/shared";
import { describe, expect, it } from "vitest";
import {
  MIN_SUBTASKS_MESSAGE,
  checkDraft,
  draftReducer,
  editedPayload,
  initialDraft,
  type SubtasksDraft,
} from "./subtasks-draft";

const payload: SubtasksPayload = {
  subtasks: [
    { title: "Write the middleware", description: "Token bucket per key", priority: "high" },
    { title: "Add tests", description: "" },
    { title: "Document the limits", description: "", priority: "low" },
  ],
  rationale: "Feature tasks get a tests subtask.",
};

function apply(draft: SubtasksDraft, ...actions: Parameters<typeof draftReducer>[1][]) {
  return actions.reduce(draftReducer, draft);
}

function accepted(draft: SubtasksDraft) {
  const check = checkDraft(draft, payload.rationale);
  if (!check.ok) throw new Error("expected a valid draft");
  return editedPayload(payload, check.payload);
}

describe("draftReducer", () => {
  it("edits a title, a description and a priority by key", () => {
    const draft = apply(
      initialDraft(payload),
      { type: "edit", key: 1, field: "title", value: "Add rate limit tests" },
      { type: "edit", key: 2, field: "description", value: "In the API docs" },
      { type: "priority", key: 1, value: "high" },
    );
    expect(draft.items.map(({ title, priority }) => [title, priority])).toEqual([
      ["Write the middleware", "high"],
      ["Add rate limit tests", "high"],
      ["Document the limits", "low"],
    ]);
    expect(draft.items[2]?.description).toBe("In the API docs");
  });

  it("removes an item and keeps the keys of the others", () => {
    const draft = apply(initialDraft(payload), { type: "remove", key: 0 });
    expect(draft.items.map((item) => item.key)).toEqual([1, 2]);
    expect(
      apply(draft, { type: "edit", key: 2, field: "title", value: "Docs" }).items[1]?.title,
    ).toBe("Docs");
  });

  it("refuses to go below two items and says why until the next edit", () => {
    const atMinimum = apply(initialDraft(payload), { type: "remove", key: 0 });
    const blocked = draftReducer(atMinimum, { type: "remove", key: 1 });
    expect(blocked.items).toHaveLength(2);
    expect(blocked.removeBlocked).toBe(true);
    expect(
      draftReducer(blocked, { type: "edit", key: 1, field: "title", value: "x" }).removeBlocked,
    ).toBe(false);
  });
});

describe("checkDraft", () => {
  it("passes the draft through the shared payload schema", () => {
    const check = checkDraft(initialDraft(payload), payload.rationale);
    expect(check).toEqual({ ok: true, payload });
  });

  it("puts a title error on the item that has it", () => {
    const draft = apply(
      initialDraft(payload),
      { type: "remove", key: 0 },
      { type: "edit", key: 2, field: "title", value: "   " },
    );
    expect(checkDraft(draft, payload.rationale)).toEqual({
      ok: false,
      items: { 2: { title: "Give it a title." } },
      list: undefined,
    });
  });

  it("limits titles to 200 characters", () => {
    const draft = draftReducer(initialDraft(payload), {
      type: "edit",
      key: 0,
      field: "title",
      value: "x".repeat(201),
    });
    const check = checkDraft(draft, payload.rationale);
    expect(check.ok ? undefined : check.items[0]?.title).toBe("Keep titles under 200 characters.");
  });

  it("explains the minimum when a split has fewer than two subtasks", () => {
    const one = initialDraft({ ...payload, subtasks: payload.subtasks.slice(0, 1) });
    expect(checkDraft(one, payload.rationale)).toMatchObject({
      ok: false,
      list: MIN_SUBTASKS_MESSAGE,
    });
    expect(MIN_SUBTASKS_MESSAGE).toBe(
      "A split needs at least 2 subtasks. Reject the suggestion instead.",
    );
  });
});

describe("editedPayload", () => {
  it("sends nothing when the user changed nothing, so the API applies the stored one", () => {
    expect(accepted(initialDraft(payload))).toBeUndefined();
  });

  it("treats a missing priority as medium and ignores whitespace around titles", () => {
    const draft = apply(
      initialDraft(payload),
      { type: "priority", key: 1, value: "medium" },
      { type: "edit", key: 0, field: "title", value: "  Write the middleware " },
    );
    expect(accepted(draft)).toBeUndefined();
  });

  it("sends the whole edited payload after an edit or a removal", () => {
    const edited = accepted(
      apply(initialDraft(payload), {
        type: "edit",
        key: 1,
        field: "title",
        value: "Add e2e tests",
      }),
    );
    expect(edited?.subtasks[1]?.title).toBe("Add e2e tests");
    expect(edited?.rationale).toBe(payload.rationale);

    const removed = accepted(apply(initialDraft(payload), { type: "remove", key: 2 }));
    expect(removed?.subtasks.map((subtask) => subtask.title)).toEqual([
      "Write the middleware",
      "Add tests",
    ]);
  });
});
