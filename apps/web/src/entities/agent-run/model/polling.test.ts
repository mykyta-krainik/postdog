import { RUN_STATUSES } from "@postdog/shared";
import { describe, expect, it } from "vitest";
import { RUN_POLL_INTERVAL_MS, runPollInterval } from "./polling";

describe("runPollInterval", () => {
  it("keeps polling about every 1.5 s while the run is running", () => {
    expect(runPollInterval({ status: "running" })).toBe(1500);
    expect(RUN_POLL_INTERVAL_MS).toBe(1500);
  });

  it.each(RUN_STATUSES.filter((status) => status !== "running"))(
    "stops polling once the run is %s",
    (status) => {
      expect(runPollInterval({ status })).toBe(0);
    },
  );

  it("does not poll a run that has not loaded, so the first fetch decides", () => {
    expect(runPollInterval(undefined)).toBe(0);
  });
});
