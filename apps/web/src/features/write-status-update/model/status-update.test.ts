import {
  statusUpdaterInputSchema,
  statusUpdaterRunSchema,
  type StatusUpdaterOutput,
  type StatusUpdaterRun,
} from "@postdog/shared";
import { describe, expect, it } from "vitest";
import {
  initialInput,
  isDraftEdited,
  notesInput,
  regenerateInput,
  retryInput,
  toStatusUpdateView,
} from "./status-update";

const update: StatusUpdaterOutput = {
  kind: "update",
  update: {
    tone: "heads_up",
    toneReason: "PD-4 has been in progress for 8 days.",
    headline: "Auth is close, PD-4 needs a reviewer",
    done: [],
    inProgress: [{ taskId: 12, identifier: "PD-12", text: "Login form wired" }],
    blockers: [],
    next: [],
  },
  warnings: [{ taskId: 12, message: "PD-12 moved from Done to In progress: its task is not done" }],
  text: "*Auth is close*\n• PD-12 Login form wired",
};

const needsNotes: StatusUpdaterOutput = {
  kind: "needs_notes",
  tasks: [
    { taskId: 3, identifier: "PD-3", title: "Rate limits" },
    { taskId: 7, identifier: "PD-7", title: "Billing export" },
  ],
  question: "What moved on these since yesterday?",
};

function run(
  status: StatusUpdaterRun["status"],
  output: StatusUpdaterOutput | null = null,
): StatusUpdaterRun {
  return statusUpdaterRunSchema.parse({
    id: 9,
    agent: "status_updater",
    mode: null,
    status,
    promptVersion: "STATUS_UPDATER_PROMPT_V1",
    input: { scope: "since" },
    output,
    trace: [],
    error: status === "failed" ? { code: "llm_error", message: "Provider down" } : null,
    langfuseTraceId: null,
    usage: null,
    llm: { mode: "mock", model: "mock" },
    startedAt: 1,
    finishedAt: status === "running" ? null : 2,
  });
}

describe("toStatusUpdateView", () => {
  it("opens the draft when the run completes with an update", () => {
    const completed = run("completed", update);
    expect(toStatusUpdateView({ status: "completed", run: completed })).toEqual({
      kind: "update",
      run: completed,
      output: update,
    });
  });

  it("asks for notes when the run completes with needs_notes", () => {
    const completed = run("completed", needsNotes);
    expect(toStatusUpdateView({ status: "completed", run: completed })).toMatchObject({
      kind: "needs_notes",
      output: { tasks: [{ identifier: "PD-3" }, { identifier: "PD-7" }] },
    });
  });

  it("calls a completed run without output empty", () => {
    expect(toStatusUpdateView({ status: "completed", run: run("completed") }).kind).toBe("empty");
  });

  it.each(["running", "failed", "cancelled"] as const)(
    "leaves a %s run to the run status",
    (status) => {
      const view = { status, run: run(status) };
      expect(toStatusUpdateView(view)).toEqual({ kind: "run_state", view });
    },
  );

  it("leaves starting and a failed request to the run status, and idle as idle", () => {
    expect(toStatusUpdateView({ status: "starting" }).kind).toBe("run_state");
    expect(toStatusUpdateView({ status: "request_failed", error: new Error("x") }).kind).toBe(
      "run_state",
    );
    expect(toStatusUpdateView({ status: "idle" })).toEqual({ kind: "idle" });
  });
});

describe("initialInput", () => {
  it("sends no window for My update, so the server picks its default", () => {
    expect(initialInput({ scope: "since" })).toEqual({ scope: "since" });
    expect(initialInput({ scope: "task", taskId: 12 })).toEqual({ scope: "task", taskId: 12 });
  });
});

describe("notesInput", () => {
  const values = {
    notes: [
      { taskId: 3, body: "  Limits are live behind a flag  " },
      { taskId: 7, body: "   " },
    ],
  };

  it("sends only the notes the user wrote, trimmed, in the same scope", () => {
    const input = notesInput({ scope: "since" }, values);
    expect(input).toEqual({
      scope: "since",
      notes: [{ taskId: 3, body: "Limits are live behind a flag" }],
    });
    expect(statusUpdaterInputSchema.safeParse(input).success).toBe(true);
  });

  it("keeps the task scope, the window and the chosen tone", () => {
    expect(notesInput({ scope: "task", taskId: 3, tone: "celebrate" }, values)).toEqual({
      scope: "task",
      taskId: 3,
      tone: "celebrate",
      notes: [{ taskId: 3, body: "Limits are live behind a flag" }],
    });
    expect(notesInput({ scope: "since", since: 1000 }, values)).toMatchObject({ since: 1000 });
  });

  it("replaces the notes of the previous answer instead of adding to them", () => {
    const previous = { scope: "since" as const, notes: [{ taskId: 7, body: "Old" }] };
    expect(notesInput(previous, values)?.notes).toEqual([
      { taskId: 3, body: "Limits are live behind a flag" },
    ]);
  });

  it("is null when every box is empty", () => {
    expect(notesInput({ scope: "since" }, { notes: [{ taskId: 3, body: " " }] })).toBeNull();
  });
});

describe("regenerateInput", () => {
  it("sends the tone the user picked over the run's tone", () => {
    expect(regenerateInput({ scope: "task", taskId: 12 }, "celebrate", "heads_up")).toEqual({
      scope: "task",
      taskId: 12,
      tone: "celebrate",
    });
  });

  it("lets the model pick again when the user kept its tone", () => {
    expect(regenerateInput({ scope: "since" }, "heads_up", "heads_up")).toEqual({ scope: "since" });
  });

  it("keeps a tone the user asked for earlier, and never resends saved notes", () => {
    const previous = {
      scope: "since" as const,
      tone: "blocked" as const,
      notes: [{ taskId: 3, body: "Done" }],
    };
    expect(regenerateInput(previous, "blocked", "blocked")).toEqual({
      scope: "since",
      tone: "blocked",
    });
  });
});

describe("retryInput", () => {
  const previous = {
    scope: "since" as const,
    tone: "neutral" as const,
    notes: [{ taskId: 3, body: "Done" }],
  };

  it("drops the notes once a run exists, because the API saved them", () => {
    expect(retryInput(previous, true)).toEqual({ scope: "since", tone: "neutral" });
  });

  it("sends the notes again when the request never produced a run", () => {
    expect(retryInput(previous, false)).toEqual(previous);
  });
});

describe("isDraftEdited", () => {
  it("guards Regenerate only when the user changed the text", () => {
    expect(isDraftEdited(update.text, update.text)).toBe(false);
    expect(isDraftEdited(`${update.text}\nAlso: lunch`, update.text)).toBe(true);
  });
});
