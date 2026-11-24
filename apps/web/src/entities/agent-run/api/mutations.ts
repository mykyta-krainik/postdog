import {
  agentRunSchema,
  startRunResponseSchema,
  type ClarifyInput,
  type DecomposerRunInput,
  type PlannerInput,
  type StartRunResponse,
  type StatusUpdaterInput,
} from '@postdog/shared';
import { mutate } from 'swr';
import { ApiError, apiKey, apiRequest } from '@/shared/api';
import { agentRunKeys } from './keys';

/** The run endpoint and request body of each agent the UI can start. */
type StartableAgents = {
  planner: PlannerInput;
  status_updater: StatusUpdaterInput;
  decomposer: DecomposerRunInput;
};

const RUN_PATHS: Record<keyof StartableAgents, `/${string}`> = {
  planner: '/agents/planner/run',
  status_updater: '/agents/status-updater/run',
  decomposer: '/agents/decomposer/run',
};

/** Starts a run. The API answers 202 with the run id at once; poll the run with useAgentRun. */
export async function startAgentRun<Agent extends keyof StartableAgents>(
  agent: Agent,
  input: StartableAgents[Agent],
): Promise<StartRunResponse> {
  const started = await apiRequest(apiKey(RUN_PATHS[agent]), startRunResponseSchema, {
    method: 'POST',
    body: input,
  });
  void revalidateRunLists();
  return started;
}

export function startPlannerRun(): Promise<StartRunResponse> {
  return startAgentRun('planner', {});
}

/** Answers a clarification, or asks the Decomposer to go ahead anyway. Starts a new run for that task. */
export async function startClarifyRun(input: ClarifyInput): Promise<StartRunResponse> {
  const started = await apiRequest(apiKey('/agents/decomposer/clarify'), startRunResponseSchema, {
    method: 'POST',
    body: input,
  });
  void revalidateRunLists();
  return started;
}

/**
 * Asks the API to stop a run, then refetches it so every useAgentRun caller sees its status.
 * A run that already settled answers 409 conflict, which is not an error for the user.
 */
export async function cancelRun(id: number): Promise<void> {
  try {
    await apiRequest(apiKey(`/agents/runs/${id}/cancel`), agentRunSchema, { method: 'POST' });
  } catch (error) {
    if (!(error instanceof ApiError && error.code === 'conflict')) throw error;
  } finally {
    await Promise.all([mutate(agentRunKeys.run(id)), revalidateRunLists()]);
  }
}

/** Refetches every mounted run list, so the nav indicator and the Runs page see a start or a stop. */
export function revalidateRunLists() {
  return mutate(agentRunKeys.isRunList);
}

export function revalidatePlannerLatest() {
  return mutate(agentRunKeys.plannerLatest);
}
