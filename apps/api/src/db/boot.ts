import { openDatabase, type Db } from "./client";
import { migrateDatabase } from "./migrate";
import { seedDatabase } from "./seed";

/** What every start runs: create the file and its directory, migrate, seed once. */
export function bootDatabase(filePath: string, now = Date.now()): { db: Db; seeded: boolean } {
  const db = openDatabase(filePath);
  migrateDatabase(db);
  return { db, seeded: seedDatabase(db, now) };
}
