import {
  plannerInputSchema,
  plannerOutputSchema,
  submitDailyPlanInputSchema,
} from "@postdog/shared";
import type { Executor } from "../../db/client";
import { loadTaskFacts } from "../context";
import { defineAgent } from "../core/definition";
import { AgentError } from "../core/errors";
import { registerMockScript } from "../core/llm";
import { runAgent } from "../core/runAgent";
import { defineTerminalTool } from "../core/tool";
import { createReadTools } from "../tools/read";
import { rankCandidates } from "./candidates";
import { plannerMockScript } from "./mock";
import { tagUserText } from "../tools/userText";
import { PLANNER_PROMPT_V1, PLANNER_PROMPT_VERSION, plannerUserMessage } from "./prompt";
import { checkPlan } from "./validate";

export const PLANNER_LOOP = "planner";

registerMockScript(PLANNER_LOOP, plannerMockScript);

const submitDailyPlan = defineTerminalTool({
  name: "submit_daily_plan",
  description: [
    "Submit today's plan: 1 to 5 tasks to start with, most important first, each with a reason and short signals.",
    "Call it once, when you have decided. It ends your work.",
    "Do not call it before you have the facts you need; use get_task for those.",
    'Example: {"focus": [{"taskId": 12, "reason": "In progress for 8 days and it unblocks the release.", "signals": ["in progress 8 days", "unblocks 2"]}], "warnings": []}.',
  ].join(" "),
  input: submitDailyPlanInputSchema,
});

function plannerTools(ex: Executor, now: number) {
  const { getTask, searchTasks } = createReadTools(ex, () => now);
  return [
    {
      ...getTask,
      run: (input: Parameters<typeof getTask.run>[0]) => tagUserText(getTask.run(input)),
      summarize: (task: ReturnType<typeof getTask.run>) => `${task.identifier} (${task.status})`,
    },
    {
      ...searchTasks,
      run: (input: Parameters<typeof searchTasks.run>[0]) => tagUserText(searchTasks.run(input)),
    },
    submitDailyPlan,
  ] as const;
}

export function createPlannerAgent(loopName: string = PLANNER_LOOP) {
  return defineAgent({
    name: "planner",
    promptVersion: PLANNER_PROMPT_VERSION,
    input: plannerInputSchema,
    output: plannerOutputSchema,
    run: async (ctx) => {
      const ranked = rankCandidates(loadTaskFacts(ctx.db, ctx.startedAt));
      if (!ranked.some((task) => !task.isBlocked)) {
        throw new AgentError(
          "nothing_valid",
          "There is no open task that is ready to start: every task is done or blocked by an open task.",
        );
      }

      const { output } = await runAgent({
        ...ctx,
        name: loopName,
        system: PLANNER_PROMPT_V1,
        userMessage: plannerUserMessage(ranked),
        tools: plannerTools(ctx.db, ctx.startedAt),
      });

      const checked = checkPlan(output.focus, loadTaskFacts(ctx.db, ctx.startedAt));
      for (const { item, warning } of checked.dropped) {
        ctx.trace.record({
          type: "validation",
          tool: submitDailyPlan.name,
          input: item,
          outputSummary: warning.message,
          durationMs: 0,
        });
      }
      ctx.trace.record({
        type: "validation",
        tool: submitDailyPlan.name,
        input: output.focus.map((item) => item.taskId),
        outputSummary: `Checked the plan against the tasks: kept ${checked.focus.length} of ${output.focus.length}`,
        durationMs: 0,
      });
      if (checked.focus.length === 0) {
        const reasons = checked.dropped.map((d) => d.warning.message).join(" ");
        throw new AgentError("nothing_valid", `No recommended task could be kept. ${reasons}`);
      }

      return {
        output: {
          focus: checked.focus,
          warnings: [...output.warnings, ...checked.dropped.map((d) => d.warning)],
          coordinationNotes: [],
        },
      };
    },
  });
}

export const plannerAgent = createPlannerAgent();
