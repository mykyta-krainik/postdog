import type { Settings } from "@postdog/shared";
import { mutate, SWRConfig } from "swr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api";
import { updateSettings } from "./update-settings";
import { settingsKey } from "./use-settings";

const saved: Settings = { aiEnabled: true, decompositionMode: "suggest" };

/** What every useSettings() caller, such as the task list, renders right now. */
function displayed(): Settings | undefined {
  return SWRConfig.defaultValue.cache.get(settingsKey)?.data as Settings | undefined;
}

function deferredResponse() {
  let respond!: (status: number, body: unknown) => void;
  const fetchMock = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        respond = (status, body) => resolve(new Response(JSON.stringify(body), { status }));
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, respond: (status: number, body: unknown) => respond(status, body) };
}

beforeEach(async () => {
  await mutate(settingsKey, saved, { revalidate: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("updateSettings", () => {
  it("sends only the changed field to PATCH /api/settings", async () => {
    const { fetchMock, respond } = deferredResponse();
    const update = updateSettings({ aiEnabled: false });
    respond(200, { ...saved, aiEnabled: false });
    await update;

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/settings",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ aiEnabled: false }) }),
    );
  });

  it("shows the change before the API answers, then keeps the saved settings", async () => {
    const { respond } = deferredResponse();
    const update = updateSettings({ aiEnabled: false });

    expect(displayed()).toEqual({ aiEnabled: false, decompositionMode: "suggest" });

    respond(200, { aiEnabled: false, decompositionMode: "suggest" });
    await expect(update).resolves.toEqual({ aiEnabled: false, decompositionMode: "suggest" });
    expect(displayed()).toEqual({ aiEnabled: false, decompositionMode: "suggest" });
  });

  it("shows what the API saved when it differs from the patch", async () => {
    const { respond } = deferredResponse();
    const update = updateSettings({ decompositionMode: "auto" });
    respond(200, { aiEnabled: false, decompositionMode: "auto" });
    await update;

    expect(displayed()).toEqual({ aiEnabled: false, decompositionMode: "auto" });
  });

  it("rolls back and rethrows when the API rejects the change", async () => {
    const { respond } = deferredResponse();
    const update = updateSettings({ decompositionMode: "auto" });
    expect(displayed()?.decompositionMode).toBe("auto");

    respond(400, { error: { code: "validation_error", message: "Bad settings" } });
    await expect(update).rejects.toBeInstanceOf(ApiError);
    expect(displayed()).toEqual(saved);
  });

  it("rolls back when the API is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    await expect(updateSettings({ aiEnabled: false })).rejects.toMatchObject({
      code: "network_error",
    });
    expect(displayed()).toEqual(saved);
  });
});
