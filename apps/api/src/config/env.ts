import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { IN_MEMORY } from "../db/client";

export const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

export const LLM_PROVIDERS = ["anthropic", "openai", "openrouter"] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

const blankAsUnset = (value: unknown) => (value === "" ? undefined : value);

const optionalText = z.preprocess(blankAsUnset, z.string().trim().min(1).optional());

const envSchema = z.object({
  /** Loopback only by default: the API has no auth, so other machines must not reach it. */
  API_HOST: z.preprocess(blankAsUnset, z.string().trim().min(1).default("127.0.0.1")),
  API_PORT: z.preprocess(blankAsUnset, z.coerce.number().int().min(0).max(65_535).default(4000)),
  DATABASE_PATH: z
    .preprocess(blankAsUnset, z.string().trim().min(1).default("./apps/api/data/postdog.db"))
    .transform((path) => (path === IN_MEMORY ? path : resolve(REPO_ROOT, path))),
  ANTHROPIC_API_KEY: optionalText,
  OPENAI_API_KEY: optionalText,
  OPENROUTER_API_KEY: optionalText,
  LLM_MOCK: z
    .preprocess(blankAsUnset, z.enum(["true", "false"]).default("false"))
    .transform((value) => value === "true"),
  LLM_MODEL: z.preprocess(
    blankAsUnset,
    z
      .templateLiteral([z.enum(LLM_PROVIDERS), ":", z.string().min(1)])
      .default("anthropic:claude-sonnet-5-5"),
  ),
  LANGFUSE_PUBLIC_KEY: optionalText,
  LANGFUSE_SECRET_KEY: optionalText,
  LANGFUSE_BASE_URL: z.preprocess(blankAsUnset, z.url().optional()),
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
