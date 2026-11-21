import { reconcileInterruptedRuns } from "../services/agentRuns";
import { openDatabase, type Db } from "./client";
import { migrateDatabase } from "./migrate";
import { seedDatabase } from "./seed";

/** What every start runs: create the file and its directory, migrate, seed once, fail interrupted runs. */
export function bootDatabase(
  filePath: string,
  now = Date.now(),
): { db: Db; seeded: boolean; interrupted: number } {
  const db = openDatabase(filePath);
  migrateDatabase(db);
  const seeded = seedDatabase(db, now);
  return { db, seeded, interrupted: reconcileInterruptedRuns(db, now) };
}
