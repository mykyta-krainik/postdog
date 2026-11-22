"use client";

import { decomposerRunSchema } from "@postdog/shared";
import { startAgentRun, useAgentRunner } from "@/entities/agent-run";
import { revalidateSuggestions } from "@/entities/suggestion";

/**
 * One default Decomposer run: the server picks up to 10 eligible to-do tasks. The task list
 * refetches when it starts, so the picked tasks show they are processing, and when it settles,
 * so the new dots appear.
 */
export function useDecompose() {
  return useAgentRunner({
    start: async () => {
      const started = await startAgentRun("decomposer", {});
      void revalidateSuggestions();
      return started;
    },
    schema: decomposerRunSchema,
    onSettled: () => void revalidateSuggestions(),
  });
}
