import { describe, expect, it } from "vitest";
import { runTimingText, runTitle } from "./run-summary";

const now = new Date(2026, 10, 22, 15, 0).getTime();

describe("runTitle", () => {
  it("uses the API's label", () => {
    expect(runTitle({ agent: "status_updater", label: "Status update for PD-7" })).toBe(
      "Status update for PD-7",
    );
  });

  it("falls back to the agent's name for an empty label", () => {
    expect(runTitle({ agent: "decomposer", label: "  " })).toBe("Decomposer run");
  });
});

describe("runTimingText", () => {
  it("says a running run is still running", () => {
    expect(
      runTimingText({ status: "running", startedAt: now - 5_000, finishedAt: null }, now),
    ).toBe("Started just now, still running");
  });

  it("says how long a settled run took", () => {
    const run = {
      status: "completed" as const,
      startedAt: now - 300_000,
      finishedAt: now - 115_000,
    };
    expect(runTimingText(run, now)).toBe("Started 5 min ago, took 3 min 5 s");
  });
});
