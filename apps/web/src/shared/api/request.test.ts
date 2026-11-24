import { settingsSchema } from "@postdog/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError, getValidationIssues, isRetryableError } from "./api-error";
import { apiRequest } from "./request";

function respondWith(status: number, body?: unknown) {
  const text = body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body);
  const fetchMock = vi.fn(async () => new Response(status === 204 ? null : text, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function caught(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (!(error instanceof ApiError)) throw new Error(`expected an ApiError, got ${String(error)}`);
  return error;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiRequest", () => {
  it("returns the body parsed with the schema", async () => {
    const settings = { aiEnabled: false, decompositionMode: "auto", scheduledRunsEnabled: true };
    respondWith(200, settings);
    await expect(apiRequest("/api/settings", settingsSchema)).resolves.toEqual(settings);
  });

  it("sends a JSON body with the method", async () => {
    const fetchMock = respondWith(200, {
      aiEnabled: true,
      decompositionMode: "suggest",
      scheduledRunsEnabled: true,
    });
    await apiRequest("/api/settings", settingsSchema, {
      method: "PATCH",
      body: { aiEnabled: true },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/settings",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ aiEnabled: true }),
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  it("sends an empty JSON object on a write without a body, which the API requires", async () => {
    const fetchMock = respondWith(204);
    await apiRequest("/api/tasks/1", z.undefined(), { method: "DELETE" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tasks/1",
      expect.objectContaining({
        method: "DELETE",
        body: "{}",
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  it("sends a read without a body or a content type", async () => {
    const fetchMock = respondWith(200, {
      aiEnabled: true,
      decompositionMode: "suggest",
      scheduledRunsEnabled: true,
    });
    await apiRequest("/api/settings", settingsSchema);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/settings",
      expect.objectContaining({ method: "GET", body: undefined, headers: undefined }),
    );
  });

  it("resolves a 204 with z.undefined()", async () => {
    respondWith(204);
    await expect(
      apiRequest("/api/tasks/1", z.undefined(), { method: "DELETE" }),
    ).resolves.toBeUndefined();
  });

  it("throws the contract error with its status, code and details", async () => {
    const issues = [{ path: "title", message: "Too long" }];
    respondWith(400, {
      error: { code: "validation_error", message: "Bad body", details: { issues } },
    });
    const error = await caught(apiRequest("/api/tasks", settingsSchema, { method: "POST" }));
    expect(error).toMatchObject({ status: 400, code: "validation_error", message: "Bad body" });
    expect(getValidationIssues(error)).toEqual(issues);
  });

  it("reports an unreachable API when the proxy answers 500 without a contract body", async () => {
    respondWith(500, "Internal Server Error");
    const error = await caught(apiRequest("/api/settings", settingsSchema));
    expect(error).toMatchObject({ status: 500, code: "network_error" });
    expect(isRetryableError(error)).toBe(true);
  });

  it("reports a network failure when fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    const error = await caught(apiRequest("/api/settings", settingsSchema));
    expect(error).toMatchObject({ status: 0, code: "network_error" });
  });

  it("rejects a success body that breaks the contract", async () => {
    respondWith(200, { aiEnabled: "yes" });
    const error = await caught(apiRequest("/api/settings", settingsSchema));
    expect(error.code).toBe("unexpected_response");
  });
});

describe("error helpers", () => {
  it("does not retry client errors", () => {
    expect(isRetryableError(new ApiError(404, "not_found", "Gone"))).toBe(false);
    expect(isRetryableError(new ApiError(409, "stale", "Changed"))).toBe(false);
  });

  it("returns no validation issues for other errors", () => {
    expect(getValidationIssues(new ApiError(404, "not_found", "Gone"))).toEqual([]);
    expect(getValidationIssues(new Error("boom"))).toEqual([]);
  });
});
