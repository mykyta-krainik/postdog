import { describe, expect, it } from "vitest";
import { createNoteInputSchema } from "@postdog/shared";

describe("createNoteInputSchema", () => {
  it("trims the body", () => {
    expect(createNoteInputSchema.parse({ body: "  Shipped the fix\n" })).toEqual({
      body: "Shipped the fix",
    });
  });

  it("rejects an empty or whitespace-only body", () => {
    expect(createNoteInputSchema.safeParse({ body: "" }).success).toBe(false);
    expect(createNoteInputSchema.safeParse({ body: "   " }).success).toBe(false);
  });

  it("accepts 5000 characters and rejects 5001", () => {
    expect(createNoteInputSchema.safeParse({ body: "a".repeat(5000) }).success).toBe(true);
    expect(createNoteInputSchema.safeParse({ body: "a".repeat(5001) }).success).toBe(false);
  });
});
