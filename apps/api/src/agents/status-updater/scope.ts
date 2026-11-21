import { AGENT_LIMITS, type StatusUpdaterInput } from "@postdog/shared";
import type { Executor } from "../../db/client";
import type { TaskNoteRow } from "../../db/schema";
import { listNotesSince } from "../../repositories/notes";
import { loadTaskFacts, type TaskFacts } from "../context";

export interface StatusRow extends TaskFacts {
  parentIdentifier: string | null;
  notes: TaskNoteRow[];
  statusChanged: boolean;
  subtasksChanged: number;
  hasProgress: boolean;
  changed: boolean;
  lastActivityAt: number;
}

export interface StatusScope {
  now: number;
  windowStart: number;
  changedCount: number;
  rows: StatusRow[];
  identifiers: ReadonlyMap<number, string>;
}

export function windowStartOf(input: StatusUpdaterInput, now: number): number {
  const since = input.scope === "since" ? input.since : undefined;
  return since ?? now - AGENT_LIMITS.statusUpdateDefaultWindowMs;
}

function toRows(facts: TaskFacts[], notes: TaskNoteRow[], windowStart: number): StatusRow[] {
  const identifiers = new Map(facts.map((task) => [task.id, task.identifier]));
  return facts.map((task) => {
    const taskNotes = notes.filter((note) => note.taskId === task.id);
    const subtaskChanges = facts.filter(
      (t) => t.parentId === task.id && t.statusChangedAt >= windowStart,
    );
    const statusChanged = task.statusChangedAt >= windowStart;
    const lastActivityAt = Math.max(
      task.updatedAt,
      ...taskNotes.map((note) => note.createdAt),
      ...subtaskChanges.map((t) => t.statusChangedAt),
    );
    return {
      ...task,
      parentIdentifier: task.parentId === null ? null : (identifiers.get(task.parentId) ?? null),
      notes: taskNotes,
      statusChanged,
      subtasksChanged: subtaskChanges.length,
      hasProgress: taskNotes.length > 0 || statusChanged || subtaskChanges.length > 0,
      changed: lastActivityAt >= windowStart,
      lastActivityAt,
    };
  });
}

export function loadStatusScope(ex: Executor, input: StatusUpdaterInput, now: number): StatusScope {
  const windowStart = windowStartOf(input, now);
  const all = toRows(loadTaskFacts(ex, now), listNotesSince(ex, windowStart), windowStart);
  const identifiers = new Map(all.map((row) => [row.id, row.identifier]));

  if (input.scope === "task") {
    const root = all.find((row) => row.id === input.taskId);
    const rows = root ? [root, ...all.filter((row) => row.parentId === root.id)] : [];
    return {
      now,
      windowStart,
      changedCount: rows.filter((r) => r.changed).length,
      rows,
      identifiers,
    };
  }

  const changed = all
    .filter((row) => row.changed)
    .sort((a, b) => b.lastActivityAt - a.lastActivityAt || b.id - a.id);
  return {
    now,
    windowStart,
    changedCount: changed.length,
    rows: changed.slice(0, AGENT_LIMITS.maxStatusUpdateTasks),
    identifiers,
  };
}
