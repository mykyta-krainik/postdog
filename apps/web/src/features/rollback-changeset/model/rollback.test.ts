import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api";
import { keptItemText, rollbackChangeset, rollbackErrorMessage, rollbackRequest } from "./rollback";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("rollbackRequest", () => {
  it("rolls back the whole changeset with an empty body", () => {
    expect(rollbackRequest({ changesetId: 7 })).toEqual({
      url: "/api/changesets/7/rollback",
      body: {},
    });
  });

  it("rolls back one task's part with its id", () => {
    expect(rollbackRequest({ changesetId: 7, taskId: 12 })).toEqual({
      url: "/api/changesets/7/rollback",
      body: { taskId: 12 },
    });
  });
});

describe("rollbackChangeset", () => {
  it("posts the body and returns the parsed response", async () => {
    const response = {
      changeset: {
        id: 7,
        runId: 41,
        status: "partially_rolled_back",
        createdAt: 1,
        tasks: [],
        counts: { subtasks: 3, links: 0 },
      },
      deleted: { tasks: 2, links: 0 },
      kept: [],
      message: "Removed 2 subtasks. 1 subtask was edited and kept.",
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(response), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(rollbackChangeset({ changesetId: 7, taskId: 12 })).resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/changesets/7/rollback",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ taskId: 12 }) }),
    );
  });
});

describe("rollbackErrorMessage", () => {
  it("explains the errors a rollback can meet", () => {
    expect(rollbackErrorMessage(new ApiError(404, "not_found", "x"))).toMatch(/gone/);
    expect(rollbackErrorMessage(new ApiError(409, "conflict", "x"))).toMatch(/already rolled back/);
    expect(rollbackErrorMessage(new ApiError(400, "validation_error", "x"))).toMatch(
      /no longer part/,
    );
    expect(rollbackErrorMessage(new ApiError(0, "network_error", "x"))).toMatch(/can't reach/);
  });

  it("passes the API's own message through otherwise", () => {
    expect(rollbackErrorMessage(new ApiError(500, "internal_error", "Disk full"))).toBe(
      "Disk full",
    );
    expect(rollbackErrorMessage(new Error("boom"))).toBe("Something went wrong. Try again.");
  });
});

describe("keptItemText", () => {
  const base = { id: 30, taskId: 12, identifier: "PD-30", title: "Write tests" } as const;

  it("names a kept subtask and says why", () => {
    expect(keptItemText({ ...base, type: "create_task", reason: "has_children" })).toEqual({
      name: "PD-30 Write tests",
      reason: "has its own subtasks",
    });
    expect(keptItemText({ ...base, type: "create_task", reason: "status_changed" }).reason).toBe(
      "was started or finished",
    );
  });

  it("names a kept link by its task", () => {
    expect(
      keptItemText({
        ...base,
        type: "create_link",
        identifier: "PD-12",
        title: "Auth",
        reason: "not_found",
      }),
    ).toEqual({ name: "The link on PD-12 Auth", reason: "was already gone" });
  });

  it("copes with a deleted task", () => {
    expect(
      keptItemText({
        ...base,
        type: "create_task",
        identifier: null,
        title: null,
        reason: "edited",
      }),
    ).toEqual({ name: "A subtask", reason: "was edited" });
  });
});
