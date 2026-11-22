import { ROLLBACK_KEPT_REASONS, type ChangesetTaskState } from "@postdog/shared";
import { describe, expect, it } from "vitest";
import {
  CHANGESET_TASK_STATE_META,
  KEPT_REASON_TEXT,
  canRollBackChangeset,
  canRollBackTask,
  linksChip,
  notificationTitle,
  subtasksChip,
  unreadBadgeText,
} from "./describe";

describe("unreadBadgeText", () => {
  it("shows nothing until there is something unread", () => {
    expect(unreadBadgeText(undefined)).toBeNull();
    expect(unreadBadgeText(0)).toBeNull();
  });

  it("shows the count up to nine, then 9+", () => {
    expect(unreadBadgeText(1)).toBe("1");
    expect(unreadBadgeText(9)).toBe("9");
    expect(unreadBadgeText(10)).toBe("9+");
    expect(unreadBadgeText(250)).toBe("9+");
  });
});

describe("notificationTitle", () => {
  it("uses the API's title", () => {
    expect(notificationTitle({ kind: "conflict", title: "Skipped PD-7" })).toBe("Skipped PD-7");
  });

  it("falls back to the kind for an empty title", () => {
    expect(notificationTitle({ kind: "agent_failed", title: "  " })).toBe("An agent run failed");
  });
});

describe("changeset task states", () => {
  it("reads a partial rollback as some edits kept", () => {
    expect(CHANGESET_TASK_STATE_META.partially_rolled_back.label).toBe("Some edits kept");
    expect(CHANGESET_TASK_STATE_META.rolled_back.label).toBe("Rolled back");
    expect(CHANGESET_TASK_STATE_META.applied.label).toBe("Applied");
    expect(CHANGESET_TASK_STATE_META.kept.label).toBe("Kept");
  });

  it("offers Roll back only while a task's part is untouched by a rollback", () => {
    const states: ChangesetTaskState[] = [
      "applied",
      "rolled_back",
      "partially_rolled_back",
      "kept",
    ];
    expect(states.filter((state) => canRollBackTask({ state }))).toEqual(["applied"]);
  });

  it("offers Roll back everything while any task can still roll back", () => {
    expect(canRollBackChangeset({ tasks: [] })).toBe(false);
    expect(canRollBackChangeset({ tasks: [{ state: "rolled_back" }, { state: "applied" }] })).toBe(
      true,
    );
    expect(canRollBackChangeset({ tasks: [{ state: "rolled_back" }, { state: "kept" }] })).toBe(
      false,
    );
  });
});

describe("KEPT_REASON_TEXT", () => {
  it("explains every reason in plain words", () => {
    for (const reason of ROLLBACK_KEPT_REASONS) expect(KEPT_REASON_TEXT[reason]).not.toBe("");
    expect(KEPT_REASON_TEXT.has_children).toBe("has its own subtasks");
    expect(KEPT_REASON_TEXT.has_notes).toBe("has notes");
    expect(KEPT_REASON_TEXT.status_changed).toBe("was started or finished");
    expect(KEPT_REASON_TEXT.edited).toBe("was edited");
  });
});

describe("chips", () => {
  it("pluralizes", () => {
    expect(subtasksChip(1)).toBe("1 subtask");
    expect(subtasksChip(3)).toBe("3 subtasks");
    expect(linksChip(0)).toBe("0 links");
    expect(linksChip(1)).toBe("1 link");
  });
});
