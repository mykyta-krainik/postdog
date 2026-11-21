import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { IN_MEMORY } from "../db/client";

export const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

const blankAsUnset = (value: unknown) => (value === "" ? undefined : value);

const envSchema = z.object({
  API_PORT: z.preprocess(blankAsUnset, z.coerce.number().int().min(0).max(65_535).default(4000)),
  DATABASE_PATH: z
    .preprocess(blankAsUnset, z.string().trim().min(1).default("./apps/api/data/postdog.db"))
    .transform((path) => (path === IN_MEMORY ? path : resolve(REPO_ROOT, path))),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment. ${problems.join("; ")}`);
  }
  return result.data;
}

/** Reads the repo-root .env when present (real env vars win), then validates. */
export function loadEnv(): Env {
  const envFile = resolve(REPO_ROOT, ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  return parseEnv(process.env);
}
