import type {
  ChangesetOp,
  RollbackInput,
  RollbackKeptItem,
  RollbackKeptReason,
  RollbackResponse,
} from "@postdog/shared";
import type { Db, Executor } from "../db/client";
import { notFound } from "../lib/errors";
import { findChangeset, summarizeChangeset, updateChangesetOps } from "../repositories/changesets";
import { deleteLink } from "../repositories/links";
import { listNotes } from "../repositories/notes";
import {
  markSuggestionsRolledBack,
  supersedeSuggestionsOfTasks,
} from "../repositories/suggestions";
import { deleteTask, findTask, listSubtaskIds } from "../repositories/tasks";
import { subtaskKeptReason } from "./rollbackRules";

/** A subtask that is already gone counts as undone, so it is never listed as kept. */
type KeptReason = Exclude<RollbackKeptReason, "not_found">;
type KeptItem = RollbackKeptItem & { reason: KeptReason };

/** What undoing one applied op did. */
type Undo = { state: "rolled_back"; deleted: boolean } | { state: "kept"; item: KeptItem };

export const NOTHING_TO_ROLL_BACK = "Nothing left to roll back.";

/** The singular and plural endings of "N subtask(s) ...", in the order the message lists them. */
const KEPT_PHRASES: Record<KeptReason, [one: string, many: string]> = {
  edited: ["was edited and kept", "were edited and kept"],
  has_children: ["had its own subtasks and was kept", "had their own subtasks and were kept"],
  has_notes: ["had notes and was kept", "had notes and were kept"],
  status_changed: ["was started or finished and kept", "were started or finished and kept"],
};

function counted(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/** The sentence the Inbox shows, e.g. "Removed 5 subtasks and 1 link. 2 subtasks were edited and kept." */
export function rollbackMessage(
  deleted: RollbackResponse["deleted"],
  kept: readonly { reason: KeptReason }[],
): string {
  const removed = [
    deleted.tasks > 0 ? counted(deleted.tasks, "subtask") : "",
    deleted.links > 0 ? counted(deleted.links, "link") : "",
  ].filter(Boolean);
  const sentences = removed.length > 0 ? [`Removed ${removed.join(" and ")}.`] : [];
  for (const [reason, [one, many]] of Object.entries(KEPT_PHRASES)) {
    const n = kept.filter((item) => item.reason === reason).length;
    if (n > 0) sentences.push(`${counted(n, "subtask")} ${n === 1 ? one : many}.`);
  }
  return sentences.length > 0 ? sentences.join(" ") : NOTHING_TO_ROLL_BACK;
}

/** Deletes the subtask when it is untouched, the only kind a rollback may delete. */
function undoSubtask(ex: Executor, op: ChangesetOp): Undo {
  const task = findTask(ex, op.id);
  const reason = subtaskKeptReason(
    task,
    listSubtaskIds(ex, op.id).length,
    listNotes(ex, op.id).length,
  );
  if (reason === null) return { state: "rolled_back", deleted: deleteTask(ex, op.id) };
  if (!task || reason === "not_found") return { state: "rolled_back", deleted: false };
  const { identifier, title } = task;
  return {
    state: "kept",
    item: { type: op.type, id: op.id, taskId: op.taskId, identifier, title, reason },
  };
}

/** A link cannot be edited, and one the user already deleted is undone already. */
function undoLink(ex: Executor, op: ChangesetOp): Undo {
  return { state: "rolled_back", deleted: deleteLink(ex, op.id) };
}

const UNDO_OP: Record<ChangesetOp["type"], (ex: Executor, op: ChangesetOp) => Undo> = {
  create_task: undoSubtask,
  create_link: undoLink,
};

/**
 * Undoes the changeset's applied ops, or only those of `taskId` (spec 8.2). Call it inside a
 * transaction: every delete and state change commits or rolls back together.
 */
export function rollbackChangeset(
  ex: Executor,
  id: number,
  { taskId }: RollbackInput,
  now: number,
): RollbackResponse {
  const changeset = findChangeset(ex, id);
  if (!changeset) throw notFound(`Changeset ${id} not found`);
  if (taskId !== undefined && !changeset.ops.some((op) => op.taskId === taskId)) {
    throw notFound(`Changeset ${id} changed nothing for task ${taskId}`);
  }

  const undone = changeset.ops
    .filter((op) => op.state === "applied" && (taskId === undefined || op.taskId === taskId))
    .map((op) => ({ op, undo: UNDO_OP[op.type](ex, op) }));
  if (undone.length === 0) {
    return {
      changeset: summarizeChangeset(ex, changeset),
      deleted: { tasks: 0, links: 0 },
      kept: [],
      message: NOTHING_TO_ROLL_BACK,
    };
  }

  const newState = new Map(undone.map(({ op, undo }) => [op, undo.state]));
  const updated = updateChangesetOps(
    ex,
    id,
    changeset.ops.map((op) => ({ ...op, state: newState.get(op) ?? op.state })),
  )!;

  const deletedOps = undone
    .filter(({ undo }) => undo.state === "rolled_back" && undo.deleted)
    .map(({ op }) => op);
  const deletedTaskIds = deletedOps.filter((op) => op.type === "create_task").map((op) => op.id);
  supersedeSuggestionsOfTasks(ex, deletedTaskIds, now);

  const rolledBackTaskIds = undone
    .filter(({ undo }) => undo.state === "rolled_back")
    .map(({ op }) => op.taskId);
  markSuggestionsRolledBack(ex, {
    runId: changeset.runId,
    targetIds: [...new Set(rolledBackTaskIds)],
    now,
  });

  const kept = undone.flatMap(({ undo }) => (undo.state === "kept" ? [undo.item] : []));
  const deleted = {
    tasks: deletedTaskIds.length,
    links: deletedOps.length - deletedTaskIds.length,
  };
  return {
    changeset: summarizeChangeset(ex, updated),
    deleted,
    kept,
    message: rollbackMessage(deleted, kept),
  };
}

export function createChangesetService(db: Db) {
  return {
    rollback(id: number, input: RollbackInput): RollbackResponse {
      return db.transaction((tx) => rollbackChangeset(tx, id, input, Date.now()));
    },
  };
}

export type ChangesetService = ReturnType<typeof createChangesetService>;
