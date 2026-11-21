import type { PlannerInput, StatusUpdaterInput } from "@postdog/shared";
import type { AgentDefinition } from "./core/definition";
import { plannerAgent } from "./planner";
import { statusUpdaterAgent } from "./status-updater";

export interface AgentRegistry {
  planner: AgentDefinition<PlannerInput, unknown>;
  status_updater: AgentDefinition<StatusUpdaterInput, unknown>;
}

export const agentRegistry: AgentRegistry = {
  planner: plannerAgent,
  status_updater: statusUpdaterAgent,
};
