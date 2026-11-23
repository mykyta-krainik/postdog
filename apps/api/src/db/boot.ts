import { openDatabase, type Db } from "./client";
import { migrateDatabase } from "./migrate";
import { seedDatabase } from "./seed";

/**
 * Creates the file and its directory, migrates and seeds once. It never touches agent runs:
 * another process may be running them. The server fails interrupted runs once it holds its
 * port (see lifecycle.ts).
 */
export function bootDatabase(filePath: string, now = Date.now()): { db: Db; seeded: boolean } {
  const db = openDatabase(filePath);
  migrateDatabase(db);
  return { db, seeded: seedDatabase(db, now) };
}
