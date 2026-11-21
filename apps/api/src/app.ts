import express, { type Express } from "express";
import { mockLlm, type Llm } from "./agents/core/llm";
import { noopTracer, type Tracer } from "./agents/core/tracer";
import { agentRegistry, type AgentRegistry } from "./agents/registry";
import { createAgentController } from "./controllers/agents";
import { createLinkController } from "./controllers/links";
import { createNoteController } from "./controllers/notes";
import { createSettingsController } from "./controllers/settings";
import { createTaskController } from "./controllers/tasks";
import type { Db } from "./db/client";
import { aiEnabledGuard } from "./middleware/aiEnabledGuard";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { agentRoutes } from "./routes/agents";
import { linkRoutes } from "./routes/links";
import { noteRoutes } from "./routes/notes";
import { settingsRoutes } from "./routes/settings";
import { taskRoutes } from "./routes/tasks";
import { createAgentRunService } from "./services/agentRuns";
import { createLinkService } from "./services/links";
import { createNoteService } from "./services/notes";
import { createSettingsService } from "./services/settings";
import { createTaskService } from "./services/tasks";

/** Twenty subtasks with full 10,000-character descriptions exceed Express's 100 kB default. */
const JSON_BODY_LIMIT = "1mb";

export interface AppDeps {
  llm?: Llm;
  tracer?: Tracer;
  agents?: AgentRegistry;
}

export function createApp(db: Db, deps: AppDeps = {}): Express {
  const { llm = mockLlm, tracer = noopTracer, agents = agentRegistry } = deps;
  const runs = createAgentRunService({ db, llm, tracer });
  const settings = createSettingsService(db, runs);
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(
    "/api",
    taskRoutes(createTaskController(createTaskService(db))),
    noteRoutes(createNoteController(createNoteService(db))),
    linkRoutes(createLinkController(createLinkService(db))),
    settingsRoutes(createSettingsController(settings)),
  );
  app.use(
    "/api/agents",
    agentRoutes(createAgentController(runs, agents), agents, aiEnabledGuard(settings)),
  );
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
