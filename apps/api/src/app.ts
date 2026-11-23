import express, { type Express } from "express";
import { mockLlm, type Llm } from "./agents/core/llm";
import { noopTracer, type Tracer } from "./agents/core/tracer";
import { agentRegistry, type AgentRegistry } from "./agents/registry";
import { createAgentController } from "./controllers/agents";
import { createChangesetController } from "./controllers/changesets";
import { createLinkController } from "./controllers/links";
import { createNoteController } from "./controllers/notes";
import { createNotificationController } from "./controllers/notifications";
import { createSettingsController } from "./controllers/settings";
import { createSuggestionController } from "./controllers/suggestions";
import { createTaskController } from "./controllers/tasks";
import type { Db } from "./db/client";
import { aiEnabledGuard } from "./middleware/aiEnabledGuard";
import { crossSiteGuard } from "./middleware/crossSiteGuard";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { agentRoutes } from "./routes/agents";
import { changesetRoutes } from "./routes/changesets";
import { linkRoutes } from "./routes/links";
import { noteRoutes } from "./routes/notes";
import { notificationRoutes } from "./routes/notifications";
import { settingsRoutes } from "./routes/settings";
import { suggestionRoutes } from "./routes/suggestions";
import { taskRoutes } from "./routes/tasks";
import { createAgentRunService, type AgentRunService } from "./services/agentRuns";
import { createChangesetService } from "./services/changesets";
import { createLinkService } from "./services/links";
import { createNoteService } from "./services/notes";
import { createNotificationService } from "./services/notifications";
import { createSettingsService } from "./services/settings";
import { createSuggestionService } from "./services/suggestions";
import { createTaskService } from "./services/tasks";

/** Twenty subtasks with full 10,000-character descriptions exceed Express's 100 kB default. */
const JSON_BODY_LIMIT = "1mb";

export interface AppDeps {
  llm?: Llm;
  tracer?: Tracer;
  agents?: AgentRegistry;
  /**
   * The server passes its own to stop the runs at shutdown. Without it, one is built from
   * `llm`, `tracer` and `agents`.
   */
  runs?: AgentRunService;
}

export function createApp(db: Db, deps: AppDeps = {}): Express {
  const { llm = mockLlm, tracer = noopTracer, agents = agentRegistry } = deps;
  const runs = deps.runs ?? createAgentRunService({ db, llm, tracer, agents });
  const settings = createSettingsService(db, runs);
  const app = express();
  app.disable("x-powered-by");
  app.use("/api", crossSiteGuard);
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(
    "/api",
    taskRoutes(createTaskController(createTaskService(db))),
    noteRoutes(createNoteController(createNoteService(db))),
    linkRoutes(createLinkController(createLinkService(db))),
    settingsRoutes(createSettingsController(settings)),
    notificationRoutes(createNotificationController(createNotificationService(db))),
    changesetRoutes(createChangesetController(createChangesetService(db))),
  );
  app.use(
    "/api/agents",
    agentRoutes(createAgentController(runs), agents, aiEnabledGuard(settings)),
  );
  app.use(
    "/api/suggestions",
    suggestionRoutes(
      createSuggestionController(createSuggestionService(db)),
      aiEnabledGuard(settings),
    ),
  );
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
