"use client";

import {
  agentRunSchema,
  agentsInfoSchema,
  listAgentRunsResponseSchema,
  plannerLatestResponseSchema,
  type AgentRun,
} from "@postdog/shared";
import useSWR, { useSWRConfig } from "swr";
import type { z } from "zod";
import { fetcherFor } from "@/shared/api";
import { runPollInterval } from "../model/polling";
import { agentRunKeys, type AgentRunsQuery } from "./keys";

/** A run schema from @postdog/shared: agentRunSchema, or an agent's own, such as plannerRunSchema. */
export type RunSchema = z.ZodType<AgentRun>;

const fetchInfo = fetcherFor(agentsInfoSchema);
const fetchRuns = fetcherFor(listAgentRunsResponseSchema);
const fetchPlannerLatest = fetcherFor(plannerLatestResponseSchema);

/**
 * The model layer in use, for the "Mock AI" badge. Every agent route answers 403 while AI is off,
 * so pass enabled = aiEnabled.
 */
export function useAgentsInfo(enabled = true) {
  return useSWR(enabled ? agentRunKeys.info : null, fetchInfo, { revalidateOnFocus: false });
}

/**
 * One run, refetched every 1.5 s while it is running and never after it settles.
 * Pass an agent's run schema to get its typed input and output. Pass undefined to skip the request.
 */
export function useAgentRun<Schema extends RunSchema = typeof agentRunSchema>(
  runId: number | undefined,
  schema: Schema = agentRunSchema as unknown as Schema,
) {
  const key = runId === undefined ? null : agentRunKeys.run(runId);
  const { cache } = useSWRConfig();
  const cached = key === null ? undefined : (cache.get(key)?.data as AgentRun | undefined);
  return useSWR<z.output<Schema>>(key, fetcherFor(schema), {
    // A number from this render's data, not a function: SWR calls a function only when it
    // schedules the next poll, so a run that was not loaded yet would never start polling.
    refreshInterval: runPollInterval(cached),
    // Below the poll interval, so each poll sends a request.
    dedupingInterval: 1000,
    revalidateOnFocus: false,
  });
}

/** Run history, newest first. */
export function useAgentRuns(query: AgentRunsQuery = {}) {
  return useSWR(agentRunKeys.runs(query), fetchRuns);
}

/** The latest completed Planner run and how many tasks changed since. `latest` is null before the first plan. */
export function usePlannerLatest() {
  const { data, ...rest } = useSWR(agentRunKeys.plannerLatest, fetchPlannerLatest);
  return { ...rest, data, latest: data?.latest };
}
