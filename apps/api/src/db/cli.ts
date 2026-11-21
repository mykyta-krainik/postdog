import { rmSync } from "node:fs";
import { loadEnv } from "../config/env";
import { logger } from "../lib/logger";
import { bootDatabase } from "./boot";
import { IN_MEMORY, openDatabase } from "./client";
import { migrateDatabase } from "./migrate";

const commands: Record<string, (path: string) => string> = {
  migrate(path) {
    const db = openDatabase(path);
    migrateDatabase(db);
    db.$client.close();
    return `Migrated ${path}`;
  },
  seed(path) {
    const { db, seeded } = bootDatabase(path);
    db.$client.close();
    return seeded ? `Seeded ${path}` : `${path} was seeded before; nothing to do`;
  },
  reset(path) {
    if (path === IN_MEMORY) throw new Error("DATABASE_PATH is :memory:; there is no file to reset");
    for (const suffix of ["", "-wal", "-shm"]) rmSync(path + suffix, { force: true });
    const { db } = bootDatabase(path);
    db.$client.close();
    return `Recreated and seeded ${path}`;
  },
};

const name = process.argv[2] ?? "";
const command = commands[name];
if (!command) {
  logger.error(`Unknown command "${name}". Use one of: ${Object.keys(commands).join(", ")}.`);
  process.exitCode = 1;
} else {
  logger.info(command(loadEnv().DATABASE_PATH));
}
