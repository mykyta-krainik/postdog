import { describe, expect, it } from "vitest";
import {
  changesetSchema,
  changesetStatusOf,
  changesetSummarySchema,
  changesetTaskStateOf,
  rollbackInputSchema,
  rollbackResponseSchema,
  type ChangesetOpState,
  type ChangesetSummary,
} from "@postdog/shared";

const ops = (...states: ChangesetOpState[]) => states.map((state) => ({ state }));

describe("changesetSchema", () => {
  const changeset = {
    id: 1,
    runId: 4,
    ops: [
      { type: "create_task", id: 30, taskId: 12, state: "applied" },
      { type: "create_link", id: 7, taskId: 12, state: "kept" },
    ],
    status: "partially_rolled_back",
    createdAt: 1_000,
  };

  it("accepts a changeset with task and link ops", () => {
    expect(changesetSchema.parse(changeset)).toEqual(changeset);
  });

  it("rejects an unknown op type, op state or status", () => {
    const withOp = (op: object) => ({ ...changeset, ops: [{ ...changeset.ops[0], ...op }] });
    expect(changesetSchema.safeParse(withOp({ type: "delete_task" })).success).toBe(false);
    expect(changesetSchema.safeParse(withOp({ state: "deleted" })).success).toBe(false);
    expect(changesetSchema.safeParse(withOp({ taskId: 0 })).success).toBe(false);
    expect(changesetSchema.safeParse({ ...changeset, status: "kept" }).success).toBe(false);
  });
});

describe("changesetTaskStateOf", () => {
  it("is applied until a rollback touches the task", () => {
    expect(changesetTaskStateOf(ops("applied", "applied"))).toBe("applied");
  });

  it("is rolled_back when every op was rolled back", () => {
    expect(changesetTaskStateOf(ops("rolled_back", "rolled_back"))).toBe("rolled_back");
  });

  it("is kept when the rollback deleted nothing of the task", () => {
    expect(changesetTaskStateOf(ops("kept", "kept"))).toBe("kept");
    expect(changesetTaskStateOf(ops("kept", "applied"))).toBe("kept");
  });

  it("is partially_rolled_back when some ops were rolled back and some were not", () => {
    expect(changesetTaskStateOf(ops("rolled_back", "kept"))).toBe("partially_rolled_back");
    expect(changesetTaskStateOf(ops("rolled_back", "applied"))).toBe("partially_rolled_back");
  });
});

describe("changesetStatusOf", () => {
  it("is applied, rolled_back or partially_rolled_back from all the ops", () => {
    expect(changesetStatusOf(ops("applied", "applied"))).toBe("applied");
    expect(changesetStatusOf(ops("rolled_back", "rolled_back"))).toBe("rolled_back");
    expect(changesetStatusOf(ops("rolled_back", "kept"))).toBe("partially_rolled_back");
    expect(changesetStatusOf(ops("rolled_back", "applied"))).toBe("partially_rolled_back");
    expect(changesetStatusOf(ops("kept"))).toBe("partially_rolled_back");
  });
});

const summary: ChangesetSummary = {
  id: 1,
  runId: 4,
  status: "partially_rolled_back",
  createdAt: 1_000,
  tasks: [
    {
      taskId: 12,
      identifier: "PD-12",
      title: "Add SSO",
      createdSubtasks: 3,
      createdLinks: 1,
      state: "partially_rolled_back",
    },
    {
      taskId: 15,
      identifier: null,
      title: null,
      createdSubtasks: 2,
      createdLinks: 0,
      state: "applied",
    },
  ],
  counts: { subtasks: 5, links: 1 },
};

describe("changesetSummarySchema", () => {
  it("accepts a summary with a deleted task's null identifier and title", () => {
    expect(changesetSummarySchema.parse(summary)).toEqual(summary);
  });

  it("rejects a task state outside CHANGESET_TASK_STATES", () => {
    const bad = { ...summary, tasks: [{ ...summary.tasks[0], state: "deleted" }] };
    expect(changesetSummarySchema.safeParse(bad).success).toBe(false);
  });
});

describe("rollbackInputSchema", () => {
  it("rolls back the whole changeset without a taskId, or one task's part with one", () => {
    expect(rollbackInputSchema.parse({})).toEqual({});
    expect(rollbackInputSchema.parse({ taskId: 12 })).toEqual({ taskId: 12 });
    expect(rollbackInputSchema.safeParse({ taskId: "12" }).success).toBe(false);
    expect(rollbackInputSchema.safeParse({ taskId: -1 }).success).toBe(false);
  });
});

describe("rollbackResponseSchema", () => {
  const response = {
    changeset: summary,
    deleted: { tasks: 5, links: 1 },
    kept: [
      {
        type: "create_task",
        id: 31,
        taskId: 12,
        identifier: "PD-31",
        title: "Write the migration",
        reason: "edited",
      },
      {
        type: "create_link",
        id: 8,
        taskId: 12,
        identifier: null,
        title: null,
        reason: "not_found",
      },
    ],
    message: "Removed 5 subtasks and 1 link. 2 subtasks were edited and kept.",
  };

  it("accepts the counts, the kept items and the message", () => {
    expect(rollbackResponseSchema.parse(response)).toEqual(response);
  });

  it("accepts a subtask kept for its links", () => {
    const linked = { ...response, kept: [{ ...response.kept[0], reason: "has_links" }] };
    expect(rollbackResponseSchema.safeParse(linked).success).toBe(true);
  });

  it("rejects an unknown kept reason", () => {
    const bad = { ...response, kept: [{ ...response.kept[0], reason: "locked" }] };
    expect(rollbackResponseSchema.safeParse(bad).success).toBe(false);
  });
});
