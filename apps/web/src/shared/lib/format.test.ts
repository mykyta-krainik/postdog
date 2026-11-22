import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "./format";

const now = new Date(2026, 10, 22, 15, 0).getTime();
const minutes = (count: number) => now - count * 60_000;

describe("formatRelativeTime", () => {
  it("reads recent times in minutes", () => {
    expect(formatRelativeTime(now - 5_000, now)).toBe("just now");
    expect(formatRelativeTime(minutes(5), now)).toBe("5 min ago");
  });

  it("reads earlier today in hours", () => {
    expect(formatRelativeTime(minutes(180), now)).toBe("3 h ago");
  });

  it("reads yesterday, then the date", () => {
    expect(formatRelativeTime(new Date(2026, 10, 21, 23, 0).getTime(), now)).toBe("yesterday");
    expect(formatRelativeTime(new Date(2026, 10, 12, 9, 0).getTime(), now)).toBe("Nov 12");
  });
});
