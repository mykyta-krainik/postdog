import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseEnv } from "../src/config/env";

const repoRoot = resolve(import.meta.dirname, "../../..");

describe("parseEnv", () => {
  it("defaults the port and puts the database under apps/api/data", () => {
    const expected = {
      API_PORT: 4000,
      DATABASE_PATH: resolve(repoRoot, "apps/api/data/postdog.db"),
    };
    expect(parseEnv({})).toEqual(expected);
    expect(parseEnv({ API_PORT: "", DATABASE_PATH: "" })).toEqual(expected);
  });

  it("resolves a relative path from the repo root and keeps an absolute one", () => {
    expect(parseEnv({ DATABASE_PATH: "./tmp/x.db" }).DATABASE_PATH).toBe(
      resolve(repoRoot, "tmp/x.db"),
    );
    expect(parseEnv({ DATABASE_PATH: "/var/data/x.db" }).DATABASE_PATH).toBe("/var/data/x.db");
    expect(parseEnv({ DATABASE_PATH: ":memory:" }).DATABASE_PATH).toBe(":memory:");
  });

  it("fails fast on a bad port", () => {
    expect(() => parseEnv({ API_PORT: "http" })).toThrow(/API_PORT/);
    expect(() => parseEnv({ API_PORT: "70000" })).toThrow(/API_PORT/);
  });
});
