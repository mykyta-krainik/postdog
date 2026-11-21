"use client";

import { plannerRunSchema } from "@postdog/shared";
import { revalidatePlannerLatest, startPlannerRun, useAgentRunner } from "@/entities/agent-run";

/** One Planner run. A completed run refreshes the latest plan everywhere it is shown. */
export function usePlanDay() {
  return useAgentRunner({
    start: startPlannerRun,
    schema: plannerRunSchema,
    onSettled: (run) => {
      if (run.status === "completed") void revalidatePlannerLatest();
    },
  });
}
