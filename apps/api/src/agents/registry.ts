import type {
  ClarifyInput,
  DecomposerRunInput,
  PlannerInput,
  StatusUpdaterInput,
} from "@postdog/shared";
import type { AgentDefinition } from "./core/definition";
import { decomposerAgent, decomposerClarifyAgent } from "./decomposer";
import { plannerAgent } from "./planner";
import { statusUpdaterAgent } from "./status-updater";

export interface AgentRegistry {
  planner: AgentDefinition<PlannerInput, unknown>;
  status_updater: AgentDefinition<StatusUpdaterInput, unknown>;
  decomposer: AgentDefinition<DecomposerRunInput, unknown>;
  decomposer_clarify: AgentDefinition<ClarifyInput, unknown>;
}

export const agentRegistry: AgentRegistry = {
  planner: plannerAgent,
  status_updater: statusUpdaterAgent,
  decomposer: decomposerAgent,
  decomposer_clarify: decomposerClarifyAgent,
};
