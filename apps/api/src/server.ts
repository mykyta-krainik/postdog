import type { AddressInfo } from "node:net";
import { createLlm } from "./agents/core/llm";
import { createTracer } from "./agents/core/tracer";
import { createApp } from "./app";
import { loadEnv } from "./config/env";
import { bootDatabase } from "./db/boot";
import { logger } from "./lib/logger";

const env = loadEnv();
const { db, seeded, interrupted } = bootDatabase(env.DATABASE_PATH);
logger.info(seeded ? "Created and seeded the database" : "Database is up to date", {
  path: env.DATABASE_PATH,
});
if (interrupted > 0) logger.info(`Marked ${interrupted} interrupted agent runs as failed`);

const llm = createLlm(env);
const tracer = createTracer(env);
logger.info(`LLM: ${llm.info.mode} (${llm.info.model})`, {
  langfuse: tracer.enabled ? "on" : "off",
});

const server = createApp(db, { llm, tracer }).listen(env.API_PORT, env.API_HOST, (err?: Error) => {
  if (err) {
    logger.error(`API could not listen on ${env.API_HOST}:${env.API_PORT}`, { err });
    process.exit(1);
  }
  const { address, port } = server.address() as AddressInfo;
  logger.info(`API listening on http://${address}:${port}`);
});

function shutdown(): void {
  server.close(() => {
    db.$client.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
