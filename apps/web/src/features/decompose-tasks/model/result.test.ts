import { describe, expect, it } from "vitest";
import { summaryLine } from "./result";

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
  it("counts each outcome that happened", () => {
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
    ).toBe("Looked at 6 tasks: 3 split, 1 question, 1 skipped, 1 busy.");
  });

  it("uses plurals and adds related groups", () => {
    expect(
      summaryLine({
        counts: { ...zero, considered: 4, needsClarification: 2, duplicates: 2 },
        related: [{ suggestionId: 9, relation: "duplicates", taskIds: [3, 9], applied: false }],
      }),
    ).toBe("Looked at 4 tasks: 2 questions, 2 duplicates. Found 1 related group.");
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
