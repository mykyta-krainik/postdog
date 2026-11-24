import type { AddressInfo } from "node:net";
import { createLlm } from "./agents/core/llm";
import { createTracer } from "./agents/core/tracer";
import { agentRegistry } from "./agents/registry";
import { createApp } from "./app";
import { loadEnv } from "./config/env";
import { bootDatabase } from "./db/boot";
import { logger } from "./lib/logger";
import { listen, shutdown } from "./lifecycle";
import { createScheduler } from "./scheduler";
import { createAgentRunService } from "./services/agentRuns";

const env = loadEnv();
const { db, seeded } = bootDatabase(env.DATABASE_PATH);
logger.info(seeded ? "Created and seeded the database" : "Database is up to date", {
  path: env.DATABASE_PATH,
});

const llm = createLlm(env);
const tracer = createTracer(env);
logger.info(`LLM: ${llm.info.mode} (${llm.info.model})`, {
  langfuse: tracer.enabled ? "on" : "off",
});

const runs = createAgentRunService({ db, llm, tracer, agents: agentRegistry });
const scheduler = createScheduler({ db, runs });
const address = { host: env.API_HOST, port: env.API_PORT };

listen(createApp(db, { runs }), db, address, scheduler).then(
  ({ server, interrupted }) => {
    const { address: host, port } = server.address() as AddressInfo;
    logger.info(`API listening on http://${host}:${port}`);
    if (interrupted > 0) logger.info(`Marked ${interrupted} interrupted agent runs as failed`);

    const stop = (signal: NodeJS.Signals) => {
      logger.info(`${signal}: stopping the runs in progress and closing the database`);
      void shutdown({ server, runs, tracer, db, scheduler }).then((result) => {
        if (result === "timed_out") logger.error("Shutdown timed out; exiting anyway");
        process.exit(result === "clean" ? 0 : 1);
      });
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  },
  (err: unknown) => {
    logger.error(`API could not listen on ${address.host}:${address.port}`, { err });
    db.$client.close();
    process.exit(1);
  },
);
