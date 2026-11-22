import { decomposerOutputSchema } from "@postdog/shared";
import { describe, expect, it } from "vitest";
import { relatedGroupText, summaryLine } from "./result";

const zero = {
  considered: 0,
  suggestedSubtasks: 0,
  appliedSubtasks: 0,
  createdSubtasks: 0,
  appliedLinks: 0,
  needsClarification: 0,
  skipped: 0,
  duplicates: 0,
  claimed: 0,
  superseded: 0,
  failed: 0,
};

describe("summaryLine", () => {
  it("counts each outcome that happened, questions last", () => {
    expect(
      summaryLine({
        counts: {
          ...zero,
          considered: 6,
          suggestedSubtasks: 3,
          needsClarification: 1,
          skipped: 1,
          claimed: 1,
        },
        related: [],
      }),
    ).toBe("Looked at 6 tasks: 3 split, 1 skipped, 1 busy; 1 needs your answers.");
  });

  it("uses plurals and adds related groups to review", () => {
    expect(
      summaryLine({
        counts: { ...zero, considered: 4, needsClarification: 2, duplicates: 2 },
        related: [{ suggestionId: 9, relation: "duplicates", taskIds: [3, 9], applied: false }],
      }),
    ).toBe("Looked at 4 tasks: 2 duplicates; 2 need your answers. Found 1 related group.");
  });

  it("reads an auto run: what it created, the links it added, then the questions", () => {
    expect(
      summaryLine({
        counts: {
          ...zero,
          considered: 6,
          appliedSubtasks: 3,
          createdSubtasks: 9,
          appliedLinks: 2,
          needsClarification: 2,
        },
        related: [
          { suggestionId: 4, relation: "overlaps", taskIds: [1, 2], applied: true },
          { suggestionId: 5, relation: "overlaps", taskIds: [3, 4], applied: true },
        ],
      }),
    ).toBe("Looked at 6 tasks: 3 split into 9 subtasks, 2 links added; 2 need your answers.");
  });

  it("keeps the related groups auto mode did not link, such as duplicates", () => {
    expect(
      summaryLine({
        counts: { ...zero, considered: 2, appliedLinks: 1 },
        related: [
          { suggestionId: 4, relation: "overlaps", taskIds: [1, 2], applied: true },
          { suggestionId: 5, relation: "duplicates", taskIds: [3, 4], applied: false },
        ],
      }),
    ).toBe("Looked at 2 tasks: 1 link added. Found 1 related group.");
  });

  it("reads an output stored before auto mode, which has none of the new counts", () => {
    const old = decomposerOutputSchema.parse({
      tasks: [],
      related: [{ suggestionId: 9, relation: "overlaps", taskIds: [3, 9] }],
      counts: {
        considered: 3,
        suggestedSubtasks: 2,
        needsClarification: 0,
        skipped: 1,
        duplicates: 0,
        claimed: 0,
        superseded: 0,
        failed: 0,
      },
      warnings: [],
    });
    expect(old.changesetId).toBeNull();
    expect(summaryLine(old)).toBe("Looked at 3 tasks: 2 split, 1 skipped. Found 1 related group.");
  });

  it("reads plainly for one task with nothing counted", () => {
    expect(summaryLine({ counts: { ...zero, considered: 1 }, related: [] })).toBe(
      "Looked at 1 task.",
    );
  });

  it("is null when the run looked at nothing", () => {
    expect(summaryLine({ counts: zero, related: [] })).toBeNull();
  });
});

describe("relatedGroupText", () => {
  const tasks = [
    {
      taskId: 3,
      identifier: "PD-3",
      title: "A",
      outcome: "skipped",
      suggestionId: null,
      detail: "",
    },
  ] as const;

  it("names the tasks it knows and marks a linked group", () => {
    expect(
      relatedGroupText({ suggestionId: 1, relation: "overlaps", taskIds: [3, 9], applied: true }, [
        ...tasks,
      ]),
    ).toEqual({ names: "PD-3, #9", status: "Linked" });
  });

  it("marks a group that waits for review", () => {
    expect(
      relatedGroupText(
        { suggestionId: 1, relation: "duplicates", taskIds: [3, 9], applied: false },
        [...tasks],
      ).status,
    ).toBe("Possible duplicates to review");
  });
});
