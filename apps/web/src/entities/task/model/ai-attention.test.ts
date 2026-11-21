import { AI_STATES } from "@postdog/shared";
import { describe, expect, it } from "vitest";
import { shouldShowAiDot } from "./ai-attention";

describe("shouldShowAiDot", () => {
  it("shows the dot for tasks that wait for the user", () => {
    expect(shouldShowAiDot("suggestion_pending", true)).toBe(true);
    expect(shouldShowAiDot("clarification_pending", true)).toBe(true);
  });

  it("shows no dot for idle or processing tasks", () => {
    expect(shouldShowAiDot("none", true)).toBe(false);
    expect(shouldShowAiDot("processing", true)).toBe(false);
  });

  it("shows no dot at all while AI is off", () => {
    expect(AI_STATES.filter((state) => shouldShowAiDot(state, false))).toEqual([]);
  });
});
