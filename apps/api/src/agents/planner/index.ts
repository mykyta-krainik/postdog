import { plannerInputSchema, plannerOutputSchema } from "@postdog/shared";
import { defineAgent } from "../core/definition";
import { AgentError } from "../core/errors";

export const plannerAgent = defineAgent({
  name: "planner",
  promptVersion: "PLANNER_STUB",
  input: plannerInputSchema,
  output: plannerOutputSchema,
  run: async () => {
    throw new AgentError("internal_error", "The Planner agent is not implemented yet.");
  },
});
