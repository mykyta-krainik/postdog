import { describe, expect, it } from "vitest";
import { createLinkInputSchema, taskLinkSchema } from "@postdog/shared";

describe("createLinkInputSchema", () => {
  it("accepts each link type", () => {
    for (const type of ["blocks", "relates", "duplicates"]) {
      expect(createLinkInputSchema.parse({ toTaskId: 3, type })).toEqual({ toTaskId: 3, type });
    }
  });

  it("rejects an unknown link type", () => {
    expect(createLinkInputSchema.safeParse({ toTaskId: 3, type: "parent_of" }).success).toBe(false);
  });

  it("rejects a task id that is not a positive integer", () => {
    expect(createLinkInputSchema.safeParse({ toTaskId: "3", type: "blocks" }).success).toBe(false);
    expect(createLinkInputSchema.safeParse({ toTaskId: 0, type: "blocks" }).success).toBe(false);
  });
});

describe("taskLinkSchema", () => {
  const link = { id: 1, fromTaskId: 2, toTaskId: 3, type: "blocks", createdAt: 0 };

  it("accepts user and agent authors", () => {
    expect(taskLinkSchema.safeParse({ ...link, createdBy: "user" }).success).toBe(true);
    expect(taskLinkSchema.safeParse({ ...link, createdBy: "agent:41" }).success).toBe(true);
  });

  it("rejects any other author", () => {
    expect(taskLinkSchema.safeParse({ ...link, createdBy: "agent:" }).success).toBe(false);
    expect(taskLinkSchema.safeParse({ ...link, createdBy: "bob" }).success).toBe(false);
  });
});
