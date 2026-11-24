import {
  decomposerRunSchema,
  plannerRunSchema,
  statusUpdaterInputSchema,
  statusUpdaterRunSchema,
  type AgentRun,
  type DecomposerRun,
  type PlannerRun,
  type StatusUpdaterRun,
} from "@postdog/shared";
import { routes } from "@/shared/config";

/**
 * A completed run read through its agent's contract, so each result renders typed. `unknown`
 * covers an agent this page has no view for and an output that breaks its schema.
 */
export type RunResult =
  | { agent: "planner"; run: PlannerRun }
  | { agent: "status_updater"; run: StatusUpdaterRun }
  | { agent: "decomposer"; run: DecomposerRun }
  | { agent: "unknown" };

export function toRunResult(run: AgentRun): RunResult {
  switch (run.agent) {
    case "planner": {
      const parsed = plannerRunSchema.safeParse(run);
      return parsed.success ? { agent: "planner", run: parsed.data } : { agent: "unknown" };
    }
    case "status_updater": {
      const parsed = statusUpdaterRunSchema.safeParse(run);
      return parsed.success ? { agent: "status_updater", run: parsed.data } : { agent: "unknown" };
    }
    case "decomposer": {
      const parsed = decomposerRunSchema.safeParse(run);
      return parsed.success ? { agent: "decomposer", run: parsed.data } : { agent: "unknown" };
    }
    case "docs_reviewer":
      return { agent: "unknown" };
  }
}

/**
 * Where to start a run like this one again. The Runs page only looks at runs; starting one
 * belongs to the feature that owns it.
 */
export function startAgainLink(run: Pick<AgentRun, "agent" | "input">): {
  href: string;
  text: string;
} {
  switch (run.agent) {
    case "planner":
      return { href: routes.today, text: "Plan again on Today" };
    case "status_updater": {
      const input = statusUpdaterInputSchema.safeParse(run.input);
      if (input.success && input.data.scope === "task") {
        return { href: routes.task(input.data.taskId), text: "Write it again from the task" };
      }
      return { href: routes.tasks, text: "Write it again with My update on Tasks" };
    }
    case "decomposer":
    case "docs_reviewer":
      return { href: routes.tasks, text: "Start again from Tasks" };
  }
}
