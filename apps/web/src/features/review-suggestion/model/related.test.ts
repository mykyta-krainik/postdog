import { describe, expect, it } from "vitest";
import { relatedPlan } from "./related";

const pd3 = { id: 3, identifier: "PD-3", createdAt: 100 };
const pd9 = { id: 9, identifier: "PD-9", createdAt: 900 };
const pd11 = { id: 11, identifier: "PD-11", createdAt: 1100 };

describe("relatedPlan", () => {
  it("marks the newer task a duplicate of the older one, in any order", () => {
    expect(relatedPlan("duplicates", [pd9, pd3])).toEqual({
      accept: "Mark as duplicate",
      explanation: "PD-9 is marked a duplicate of PD-3, the older task. Nothing is deleted.",
      done: "Marked PD-9 as a duplicate of PD-3",
    });
  });

  it("names every newer task of a larger group", () => {
    expect(relatedPlan("duplicates", [pd11, pd3, pd9]).explanation).toBe(
      "PD-9 and PD-11 are marked duplicates of PD-3, the oldest task. Nothing is deleted.",
    );
  });

  it("explains the direction in general words until the tasks load", () => {
    expect(relatedPlan("duplicates", [pd3]).explanation).toBe(
      "The newer task is marked a duplicate of the older one.",
    );
  });

  it("only links overlapping tasks", () => {
    expect(relatedPlan("overlaps", [pd3, pd9])).toEqual({
      accept: "Link them",
      explanation: "Adds a relates link between these tasks. Nothing else changes.",
      done: "Linked PD-3 and PD-9",
    });
  });
});
