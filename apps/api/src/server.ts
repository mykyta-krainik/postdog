import type { AddressInfo } from "node:net";
import { createApp } from "./app";
import { loadEnv } from "./config/env";
import { bootDatabase } from "./db/boot";
import { logger } from "./lib/logger";

const env = loadEnv();
const { db, seeded } = bootDatabase(env.DATABASE_PATH);
logger.info(seeded ? "Created and seeded the database" : "Database is up to date", {
  path: env.DATABASE_PATH,
});

const server = createApp(db).listen(env.API_PORT, (err?: Error) => {
  if (err) {
    logger.error(`API could not listen on port ${env.API_PORT}`, { err });
    process.exit(1);
  }
  const { port } = server.address() as AddressInfo;
  logger.info(`API listening on http://localhost:${port}`);
});

function shutdown(): void {
  server.close(() => {
    db.$client.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
