import { DECOMPOSITION_MODES } from "@postdog/shared";
import { describe, expect, it } from "vitest";
import { needsConfirmation } from "./mode-change";

describe("needsConfirmation", () => {
  it("asks before switching from Suggest to Auto", () => {
    expect(needsConfirmation("suggest", "auto")).toBe(true);
  });

  it("switches back to Suggest without asking", () => {
    expect(needsConfirmation("auto", "suggest")).toBe(false);
  });

  it("never asks when the mode does not change", () => {
    for (const mode of DECOMPOSITION_MODES) expect(needsConfirmation(mode, mode)).toBe(false);
  });
});
