import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_MARKS, changedSinceText, readPlanMarks, writePlanMarks } from "./plan-marks";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("plan marks", () => {
  it("remembers dismissed and started items of a plan across reads", () => {
    const storage = memoryStorage();
    writePlanMarks(7, { dismissed: [3], started: [5] }, storage);
    expect(readPlanMarks(7, storage)).toEqual({ dismissed: [3], started: [5] });
  });

  it("uses window.localStorage by default", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    writePlanMarks(7, { dismissed: [3, 4], started: [] });
    expect(readPlanMarks(7)).toEqual({ dismissed: [3, 4], started: [] });
  });

  it("starts a new plan with nothing dismissed", () => {
    const storage = memoryStorage();
    writePlanMarks(7, { dismissed: [3], started: [] }, storage);
    expect(readPlanMarks(8, storage)).toEqual(EMPTY_MARKS);
  });

  it("works without storage", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(() => writePlanMarks(7, { dismissed: [3], started: [] })).not.toThrow();
    expect(readPlanMarks(7)).toEqual(EMPTY_MARKS);
  });

  it("works when storage throws on every call", () => {
    const blocked = memoryStorage();
    blocked.getItem = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    blocked.setItem = () => {
      throw new DOMException("full", "QuotaExceededError");
    };
    expect(() => writePlanMarks(7, { dismissed: [3], started: [] }, blocked)).not.toThrow();
    expect(readPlanMarks(7, blocked)).toEqual(EMPTY_MARKS);
  });

  it("ignores a stored value it cannot read", () => {
    const storage = memoryStorage();
    storage.setItem("postdog:today-plan", "{not json");
    expect(readPlanMarks(7, storage)).toEqual(EMPTY_MARKS);
    storage.setItem("postdog:today-plan", JSON.stringify({ runId: 7, dismissed: "3" }));
    expect(readPlanMarks(7, storage)).toEqual(EMPTY_MARKS);
  });
});

describe("changedSinceText", () => {
  it("says nothing when no task changed", () => {
    expect(changedSinceText(0)).toBeNull();
  });

  it("uses the singular for one task and the plural otherwise", () => {
    expect(changedSinceText(1)).toBe("1 task changed since this plan");
    expect(changedSinceText(3)).toBe("3 tasks changed since this plan");
  });
});
