import { decomposerRunSchema } from "@postdog/shared";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DecomposeResult } from "./decompose-result";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => {}, replace: () => {} }),
}));

function run(output: Record<string, unknown>) {
  return decomposerRunSchema.parse({
    id: 41,
    agent: "decomposer",
    status: "completed",
    mode: "auto",
    promptVersion: "DECOMPOSER_PROMPT_V1",
    llm: { mode: "mock", model: "mock" },
    langfuseTraceId: null,
    usage: null,
    input: {},
    output,
    trace: [],
    error: null,
    startedAt: 1,
    finishedAt: 2,
  });
}

const counts = {
  considered: 3,
  suggestedSubtasks: 0,
  needsClarification: 1,
  skipped: 0,
  duplicates: 0,
  claimed: 0,
  superseded: 0,
  failed: 0,
};

const tasks = [
  {
    taskId: 12,
    identifier: "PD-12",
    title: "Rate limits",
    outcome: "applied_subtasks",
    suggestionId: 5,
    detail: "Created 3 subtasks",
  },
  {
    taskId: 15,
    identifier: "PD-15",
    title: "Billing",
    outcome: "needs_clarification",
    suggestionId: 6,
    detail: "Has 1 question",
  },
];

const render = (output: Record<string, unknown>) =>
  renderToStaticMarkup(createElement(DecomposeResult, { run: run(output), onOpenTask: () => {} }));

describe("DecomposeResult in auto mode", () => {
  it("reads what was created, marks the linked group and links to the Inbox", () => {
    const html = render({
      tasks,
      related: [{ suggestionId: 8, relation: "overlaps", taskIds: [12, 15], applied: true }],
      changesetId: 7,
      counts: { ...counts, appliedSubtasks: 1, createdSubtasks: 3, appliedLinks: 1 },
      warnings: [],
    });
    expect(html).toContain(
      "Looked at 3 tasks: 1 split into 3 subtasks, 1 link added; 1 needs your answers.",
    );
    expect(html).toContain('aria-label="Subtasks created"');
    expect(html).toContain("Created 3 subtasks");
    expect(html).toContain("Linked");
    expect(html).toContain("PD-12, PD-15");
    expect(html).toContain('href="/inbox"');
    expect(html).toContain("Review in Inbox");
  });

  it("has no Inbox link when the run created nothing", () => {
    const html = render({ tasks, related: [], counts, warnings: [] });
    expect(html).not.toContain("Review in Inbox");
  });
});
