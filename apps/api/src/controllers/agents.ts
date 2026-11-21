import type {
  AgentRun,
  AgentsInfo,
  IdParams,
  ListAgentRunsQuery,
  ListAgentRunsResponse,
  PlannerInput,
  PlannerLatestResponse,
  StartRunResponse,
  StatusUpdaterInput,
} from "@postdog/shared";
import type { Request, Response } from "express";
import type { AgentRegistry } from "../agents/registry";
import type { AgentRunService } from "../services/agentRuns";

export function createAgentController(runs: AgentRunService, agents: AgentRegistry) {
  return {
    runPlanner: (req: Request<unknown, unknown, PlannerInput>, res: Response<StartRunResponse>) => {
      res.status(202).json(runs.start(agents.planner, req.body));
    },
    runStatusUpdater: (
      req: Request<unknown, unknown, StatusUpdaterInput>,
      res: Response<StartRunResponse>,
    ) => {
      res.status(202).json(runs.start(agents.status_updater, req.body));
    },
    list: (
      req: Request<unknown, unknown, unknown, ListAgentRunsQuery>,
      res: Response<ListAgentRunsResponse>,
    ) => {
      res.json({ items: runs.list(req.query) });
    },
    get: (req: Request<IdParams>, res: Response<AgentRun>) => {
      res.json(runs.get(req.params.id));
    },
    cancel: (req: Request<IdParams>, res: Response<AgentRun>) => {
      res.json(runs.cancel(req.params.id));
    },
    info: (_req: Request, res: Response<AgentsInfo>) => {
      res.json(runs.info());
    },
    plannerLatest: (_req: Request, res: Response<PlannerLatestResponse>) => {
      res.json(runs.plannerLatest());
    },
  };
}

export type AgentController = ReturnType<typeof createAgentController>;
