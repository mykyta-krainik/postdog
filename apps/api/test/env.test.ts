import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseEnv } from "../src/config/env";

const repoRoot = resolve(import.meta.dirname, "../../..");

describe("parseEnv", () => {
  it("defaults to port 4000 on 127.0.0.1 and puts the database under apps/api/data", () => {
    const expected = {
      API_HOST: "127.0.0.1",
      API_PORT: 4000,
      DATABASE_PATH: resolve(repoRoot, "apps/api/data/postdog.db"),
      LLM_MOCK: false,
      LLM_MODEL: "anthropic:claude-sonnet-5-5",
    };
    expect(parseEnv({})).toEqual(expected);
    expect(
      parseEnv({
        API_HOST: "",
        API_PORT: "",
        DATABASE_PATH: "",
        ANTHROPIC_API_KEY: "",
        LLM_MOCK: "",
        LLM_MODEL: "",
        LANGFUSE_BASE_URL: "",
      }),
    ).toEqual(expected);
  });

  it("resolves a relative path from the repo root and keeps an absolute one", () => {
    expect(parseEnv({ DATABASE_PATH: "./tmp/x.db" }).DATABASE_PATH).toBe(
      resolve(repoRoot, "tmp/x.db"),
    );
    expect(parseEnv({ DATABASE_PATH: "/var/data/x.db" }).DATABASE_PATH).toBe("/var/data/x.db");
    expect(parseEnv({ DATABASE_PATH: ":memory:" }).DATABASE_PATH).toBe(":memory:");
  });

  it("binds to the host it is given, such as every interface", () => {
    expect(parseEnv({ API_HOST: "0.0.0.0" }).API_HOST).toBe("0.0.0.0");
  });

  it("fails fast on a bad port", () => {
    expect(() => parseEnv({ API_PORT: "http" })).toThrow(/API_PORT/);
    expect(() => parseEnv({ API_PORT: "70000" })).toThrow(/API_PORT/);
  });

  it("reads the LLM and Langfuse settings", () => {
    expect(
      parseEnv({
        LLM_MOCK: "true",
        LLM_MODEL: "openai:gpt-5",
        OPENAI_API_KEY: "sk-test",
        LANGFUSE_PUBLIC_KEY: "pk",
        LANGFUSE_SECRET_KEY: "sk",
        LANGFUSE_BASE_URL: "https://cloud.langfuse.com",
      }),
    ).toMatchObject({
      LLM_MOCK: true,
      LLM_MODEL: "openai:gpt-5",
      OPENAI_API_KEY: "sk-test",
      LANGFUSE_PUBLIC_KEY: "pk",
      LANGFUSE_SECRET_KEY: "sk",
      LANGFUSE_BASE_URL: "https://cloud.langfuse.com",
    });
  });

  it("fails fast on an unknown provider, a bad mock flag or a bad Langfuse URL", () => {
    expect(() => parseEnv({ LLM_MODEL: "gemini:pro" })).toThrow(/LLM_MODEL/);
    expect(() => parseEnv({ LLM_MODEL: "claude-sonnet-5-5" })).toThrow(/LLM_MODEL/);
    expect(() => parseEnv({ LLM_MOCK: "yes" })).toThrow(/LLM_MOCK/);
    expect(() => parseEnv({ LANGFUSE_BASE_URL: "cloud" })).toThrow(/LANGFUSE_BASE_URL/);
  });
});
