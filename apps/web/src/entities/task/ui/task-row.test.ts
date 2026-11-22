import type { AiState, TaskListItem } from "@postdog/shared";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/shared/ui/tooltip";
import { TaskRow } from "./task-row";

function row(aiState: AiState, aiEnabled: boolean): string {
  const task: TaskListItem = {
    id: 12,
    identifier: "PD-12",
    title: "Add rate limits to the public API",
    status: "todo",
    priority: "high",
    parentId: null,
    aiState,
    createdAt: 1,
    updatedAt: 1,
    statusChangedAt: 1,
    subtaskCount: 0,
    subtaskDoneCount: 0,
    linkCount: 0,
  };
  return renderToStaticMarkup(
    createElement(
      TooltipProvider,
      null,
      createElement(TaskRow, { task, href: "/tasks?task=12", aiEnabled }),
    ),
  );
}

describe("the AI dot on a task row", () => {
  it("names what waits for the user, for screen readers too", () => {
    expect(row("suggestion_pending", true)).toContain("Suggestions to review");
    expect(row("clarification_pending", true)).toContain("Waiting for your answer");
    expect(row("suggestion_pending", true)).toContain('data-ai-dot="attention"');
  });

  it("shows the working variant while an agent holds the task", () => {
    const html = row("processing", true);
    expect(html).toContain('data-ai-dot="working"');
    expect(html).toContain("Postdog is working on this");
    expect(html).toContain("motion-reduce:animate-none");
  });

  it("shows no dot for an idle task", () => {
    expect(row("none", true)).not.toContain("data-ai-dot");
  });

  it("is hidden entirely while AI is off", () => {
    for (const state of ["suggestion_pending", "clarification_pending", "processing"] as const) {
      const html = row(state, false);
      expect(html).not.toContain("data-ai-dot");
      expect(html).not.toContain("Postdog is working");
    }
  });
});
