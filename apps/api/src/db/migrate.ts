import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { Db } from "./client";

const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../drizzle", import.meta.url));

/** Applies every pending migration in one transaction. */
export function migrateDatabase(db: Db): void {
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
