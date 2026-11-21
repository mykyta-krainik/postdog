import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type { RunResult } from "better-sqlite3";
import * as schema from "./schema";

export const IN_MEMORY = ":memory:";

export function openDatabase(filePath: string) {
  if (filePath !== IN_MEMORY) mkdirSync(dirname(filePath), { recursive: true });
  const sqlite = new Database(filePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle({ client: sqlite, schema });
}

export type Db = ReturnType<typeof openDatabase>;

/** A database or a transaction: what a repository function runs its queries on. */
export type Executor = BaseSQLiteDatabase<"sync", RunResult, typeof schema>;
