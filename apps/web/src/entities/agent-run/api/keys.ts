import { listAgentRunsQuerySchema } from "@postdog/shared";
import type { z } from "zod";
import { apiKey, matchesApiPath } from "@/shared/api";

/** What a caller passes to the run history endpoint. The limit defaults to 20. */
export type AgentRunsQuery = z.input<typeof listAgentRunsQuerySchema>;

export const agentRunKeys = {
  info: apiKey("/agents/info"),
  plannerLatest: apiKey("/agents/planner/latest"),
  run: (id: number) => apiKey(`/agents/runs/${id}`),
  /** Normalized through the contract schema, so equal queries share one cache entry. */
  runs: (query: AgentRunsQuery = {}) =>
    apiKey("/agents/runs", listAgentRunsQuerySchema.parse(query)),
  /** The runs going now, for the nav indicator and the entry points that would collide with them. */
  running: () => agentRunKeys.runs({ status: "running", limit: 20 }),
  /** Every run list, the running one included. Not the single runs below /agents/runs/:id. */
  isRunList: (key: unknown) =>
    matchesApiPath(key, "/agents/runs") && !String(key).startsWith("/api/agents/runs/"),
};
