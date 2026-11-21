import { describe, expect, it } from "vitest";
import { apiKey, matchesApiPath } from "./keys";

describe("apiKey", () => {
  it("prefixes the path with /api", () => {
    expect(apiKey("/settings")).toBe("/api/settings");
  });

  it("gives the same key for the same query in any order", () => {
    expect(apiKey("/tasks", { sort: "priority", status: "todo" })).toBe(
      apiKey("/tasks", { status: "todo", sort: "priority" }),
    );
  });

  it("drops empty values", () => {
    expect(apiKey("/tasks", { status: undefined, q: "", parentId: null, order: "asc" })).toBe(
      "/api/tasks?order=asc",
    );
  });

  it("encodes values so a search cannot inject params", () => {
    const key = apiKey("/tasks", { q: "auth & login" });
    expect(new URL(key, "http://x").searchParams.get("q")).toBe("auth & login");
    expect(new URL(key, "http://x").searchParams.has(" login")).toBe(false);
  });
});

describe("matchesApiPath", () => {
  it("matches the resource, its queries and its sub-resources", () => {
    expect(matchesApiPath("/api/tasks", "/tasks")).toBe(true);
    expect(matchesApiPath("/api/tasks?status=todo", "/tasks")).toBe(true);
    expect(matchesApiPath("/api/tasks/12", "/tasks")).toBe(true);
  });

  it("does not match a different resource with the same prefix", () => {
    expect(matchesApiPath("/api/tasksets", "/tasks")).toBe(false);
    expect(matchesApiPath("/api/settings", "/tasks")).toBe(false);
    expect(matchesApiPath(["/api/tasks"], "/tasks")).toBe(false);
  });
});
