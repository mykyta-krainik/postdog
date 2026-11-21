import { statusUpdaterInputSchema, statusUpdaterOutputSchema } from "@postdog/shared";
import { defineAgent } from "../core/definition";
import { AgentError } from "../core/errors";

export const statusUpdaterAgent = defineAgent({
  name: "status_updater",
  promptVersion: "STATUS_UPDATER_STUB",
  input: statusUpdaterInputSchema,
  output: statusUpdaterOutputSchema,
  run: async () => {
    throw new AgentError("internal_error", "The Status updater agent is not implemented yet.");
  },
});
