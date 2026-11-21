import type { TaskDetailLink } from "@postdog/shared";
import { describe, expect, it } from "vitest";
import { linkLabel, sortLinks } from "./links";

function link(
  id: number,
  type: TaskDetailLink["type"],
  direction: TaskDetailLink["direction"],
): TaskDetailLink {
  return {
    id,
    type,
    direction,
    task: { id: 100 + id, identifier: `PD-${100 + id}`, title: `Task ${id}`, status: "todo" },
  };
}

describe("linkLabel", () => {
  it("reads a blocks link from the side of the viewed task", () => {
    expect(linkLabel(link(1, "blocks", "out"))).toBe("Blocks");
    expect(linkLabel(link(1, "blocks", "in"))).toBe("Blocked by");
  });

  it("reads a duplicates link from the side of the viewed task", () => {
    expect(linkLabel(link(1, "duplicates", "out"))).toBe("Duplicates");
    expect(linkLabel(link(1, "duplicates", "in"))).toBe("Duplicated by");
  });

  it("reads a relates link the same way in both directions", () => {
    expect(linkLabel(link(1, "relates", "out"))).toBe("Relates to");
    expect(linkLabel(link(1, "relates", "in"))).toBe("Relates to");
  });
});

describe("sortLinks", () => {
  it("puts the tasks that block this one first", () => {
    const sorted = sortLinks([
      link(1, "relates", "out"),
      link(2, "blocks", "out"),
      link(3, "duplicates", "in"),
      link(4, "blocks", "in"),
    ]);
    expect(sorted.map(linkLabel)).toEqual(["Blocked by", "Blocks", "Duplicated by", "Relates to"]);
  });

  it("keeps the API order inside one relation", () => {
    const sorted = sortLinks([
      link(7, "blocks", "in"),
      link(3, "relates", "in"),
      link(5, "blocks", "in"),
    ]);
    expect(sorted.map((l) => l.id)).toEqual([7, 5, 3]);
  });
});
