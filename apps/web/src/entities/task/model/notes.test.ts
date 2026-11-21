import type { TaskNote } from "@postdog/shared";
import { describe, expect, it } from "vitest";
import { appendNote } from "./notes";

const note = (id: number, body = `Note ${id}`): TaskNote => ({
  id,
  taskId: 3,
  body,
  createdAt: 1_000 + id,
});

describe("appendNote", () => {
  it("adds the new note last, since the timeline runs oldest first", () => {
    expect(appendNote({ items: [note(1), note(2)] }, note(5))).toEqual({
      items: [note(1), note(2), note(5)],
    });
  });

  it("does not add a note the list already holds", () => {
    const list = { items: [note(1), note(5)] };
    expect(appendNote(list, note(5))).toEqual({ items: [note(1), note(5)] });
  });

  it("leaves a list that has not loaded yet for the fetch to fill", () => {
    expect(appendNote(undefined, note(5))).toBeUndefined();
  });
});
