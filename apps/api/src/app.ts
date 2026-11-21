import express, { type Express } from "express";
import { createLinkController } from "./controllers/links";
import { createNoteController } from "./controllers/notes";
import { createSettingsController } from "./controllers/settings";
import { createTaskController } from "./controllers/tasks";
import type { Db } from "./db/client";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { linkRoutes } from "./routes/links";
import { noteRoutes } from "./routes/notes";
import { settingsRoutes } from "./routes/settings";
import { taskRoutes } from "./routes/tasks";
import { createLinkService } from "./services/links";
import { createNoteService } from "./services/notes";
import { createSettingsService } from "./services/settings";
import { createTaskService } from "./services/tasks";

/** Twenty subtasks with full 10,000-character descriptions exceed Express's 100 kB default. */
const JSON_BODY_LIMIT = "1mb";

export function createApp(db: Db): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(
    "/api",
    taskRoutes(createTaskController(createTaskService(db))),
    noteRoutes(createNoteController(createNoteService(db))),
    linkRoutes(createLinkController(createLinkService(db))),
    settingsRoutes(createSettingsController(createSettingsService(db))),
  );
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
