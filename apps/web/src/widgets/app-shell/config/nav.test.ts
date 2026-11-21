import { describe, expect, it } from "vitest";
import { navItemsFor } from "./nav";

const labels = (aiEnabled: boolean) => navItemsFor(aiEnabled).map((item) => item.label);

describe("navItemsFor", () => {
  it("puts Today before Tasks while AI is on", () => {
    expect(labels(true)).toEqual(["Today", "Tasks", "Settings"]);
  });

  it("hides Today while AI is off and keeps the tracker", () => {
    expect(labels(false)).toEqual(["Tasks", "Settings"]);
  });
});
