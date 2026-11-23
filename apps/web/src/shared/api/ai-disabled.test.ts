import { mutate } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";
import { aiRequest, settingsKey } from "./ai-disabled";
import { ApiError } from "./api-error";

vi.mock("swr", async (importOriginal) => ({
  ...(await importOriginal<typeof import("swr")>()),
  mutate: vi.fn(),
}));

afterEach(() => {
  vi.mocked(mutate).mockClear();
});

describe("aiRequest", () => {
  it("refetches the settings when the API says AI is off, and still rejects", async () => {
    const error = new ApiError(403, "ai_disabled", "AI is turned off in Settings.");
    await expect(aiRequest(Promise.reject(error))).rejects.toBe(error);
    expect(mutate).toHaveBeenCalledWith(settingsKey);
  });

  it("leaves the settings alone for any other failure", async () => {
    const error = new ApiError(409, "stale", "The task changed.");
    await expect(aiRequest(Promise.reject(error))).rejects.toBe(error);
    await expect(aiRequest(Promise.reject(new Error("offline")))).rejects.toThrow("offline");
    expect(mutate).not.toHaveBeenCalled();
  });

  it("resolves with the response", async () => {
    await expect(aiRequest(Promise.resolve({ runId: 4 }))).resolves.toEqual({ runId: 4 });
    expect(mutate).not.toHaveBeenCalled();
  });
});
