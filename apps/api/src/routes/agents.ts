import { idParamsSchema, listAgentRunsQuerySchema } from "@postdog/shared";
import { Router, type RequestHandler } from "express";
import type { AgentRegistry } from "../agents/registry";
import type { AgentController } from "../controllers/agents";
import { validate } from "../middleware/validate";

export function agentRoutes(
  agents: AgentController,
  registry: AgentRegistry,
  guard: RequestHandler,
): Router {
  const byId = { params: idParamsSchema };
  return Router()
    .use(guard)
    .post("/planner/run", validate({ body: registry.planner.input }), agents.runPlanner)
    .post(
      "/status-updater/run",
      validate({ body: registry.status_updater.input }),
      agents.runStatusUpdater,
    )
    .post("/decomposer/run", validate({ body: registry.decomposer.input }), agents.runDecomposer)
    .post(
      "/decomposer/clarify",
      validate({ body: registry.decomposer_clarify.input }),
      agents.clarifyDecomposer,
    )
    .get("/planner/latest", agents.plannerLatest)
    .get("/runs", validate({ query: listAgentRunsQuerySchema }), agents.list)
    .get("/runs/:id", validate(byId), agents.get)
    .post("/runs/:id/cancel", validate(byId), agents.cancel)
    .get("/info", agents.info);
}
