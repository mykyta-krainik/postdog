import { listAgentRunsQuerySchema } from "@postdog/shared";
import type { z } from "zod";
import { apiKey } from "@/shared/api";

/** What a caller passes to the run history endpoint. The limit defaults to 20. */
export type AgentRunsQuery = z.input<typeof listAgentRunsQuerySchema>;

export const agentRunKeys = {
  info: apiKey("/agents/info"),
  plannerLatest: apiKey("/agents/planner/latest"),
  run: (id: number) => apiKey(`/agents/runs/${id}`),
  /** Normalized through the contract schema, so equal queries share one cache entry. */
  runs: (query: AgentRunsQuery = {}) =>
    apiKey("/agents/runs", listAgentRunsQuerySchema.parse(query)),
};
