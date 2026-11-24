import type { AgentRunSummary } from "@postdog/shared";
import { describe, expect, it } from "vitest";
import {
  RUNNING_POLL_MS,
  findRunning,
  runningPollInterval,
  settledRunIds,
  statusUpdateRunLabel,
} from "./running";

type Row = Pick<AgentRunSummary, "id" | "agent" | "label" | "status">;

const running: Row[] = [
  { id: 9, agent: "status_updater", label: "Status update for PD-7", status: "running" },
  { id: 8, agent: "decomposer", label: "Answer a clarification", status: "running" },
  { id: 7, agent: "decomposer", label: "Decompose 2 chosen tasks", status: "running" },
  { id: 6, agent: "planner", label: "Plan my day", status: "running" },
  { id: 5, agent: "status_updater", label: "My status update", status: "completed" },
];

describe("findRunning", () => {
  it("finds the running Planner run", () => {
    expect(findRunning(running, { agent: "planner" })?.id).toBe(6);
  });

  it("leaves out the caller's own run", () => {
    expect(findRunning(running, { agent: "planner" }, 6)).toBeUndefined();
  });

  it("treats any Decomposer batch as taking the slot, but not a clarification answer", () => {
    expect(findRunning(running, { agent: "decomposer" })?.id).toBe(7);
    expect(findRunning(running.slice(0, 2), { agent: "decomposer" })).toBeUndefined();
  });

  it("matches a status update by its scope", () => {
    const slot = (taskIdentifier: string | null) => ({
      agent: "status_updater" as const,
      taskIdentifier,
    });
    expect(findRunning(running, slot("PD-7"))?.id).toBe(9);
    expect(findRunning(running, slot("PD-8"))).toBeUndefined();
    // The "My update" run has settled, so nothing is in the way.
    expect(findRunning(running, slot(null))).toBeUndefined();
  });

  it("finds nothing before the list loads", () => {
    expect(findRunning(undefined, { agent: "planner" })).toBeUndefined();
  });
});

describe("statusUpdateRunLabel", () => {
  it("reads like the API's labels", () => {
    expect(statusUpdateRunLabel("PD-7")).toBe("Status update for PD-7");
    expect(statusUpdateRunLabel(null)).toBe("My status update");
  });
});

describe("runningPollInterval", () => {
  it("polls fast while something runs and slowly otherwise", () => {
    expect(runningPollInterval({ items: [{}] })).toBe(RUNNING_POLL_MS.active);
    expect(runningPollInterval({ items: [] })).toBe(RUNNING_POLL_MS.idle);
    expect(runningPollInterval(undefined)).toBe(RUNNING_POLL_MS.idle);
  });
});

describe("settledRunIds", () => {
  it("names the runs that left the running list", () => {
    expect(settledRunIds([3, 4], [4, 5])).toEqual([3]);
    expect(settledRunIds([3], [])).toEqual([3]);
    expect(settledRunIds([], [1])).toEqual([]);
  });
});
