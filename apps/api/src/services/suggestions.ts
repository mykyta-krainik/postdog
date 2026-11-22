import {
  parseSuggestionPayload,
  type AcceptSuggestionInput,
  type AcceptSuggestionResponse,
  type LinkType,
  type ListSuggestionsQuery,
  type RelatedRelation,
  type Suggestion,
  type SuggestionPayload,
  type SuggestionPayloadKind,
} from "@postdog/shared";
import type { Db, Executor } from "../db/client";
import type { TaskRow } from "../db/schema";
import { AppError, conflict, invalidField, notFound, validationError } from "../lib/errors";
import { findLink, insertLink } from "../repositories/links";
import {
  applySuggestion,
  findSuggestion,
  listPendingSuggestionsOfTask,
  listSuggestions,
  resolveSuggestion,
} from "../repositories/suggestions";
import { findTask, listTasks } from "../repositories/tasks";
import { assertUnchanged, insertSubtasks } from "./tasks";

type SuggestionOf<K extends Suggestion["kind"]> = Extract<Suggestion, { kind: K }>;

const LINK_TYPE_OF: Record<RelatedRelation, LinkType> = {
  duplicates: "duplicates",
  overlaps: "relates",
};

const CLARIFY_INSTEAD =
  "A clarification is answered, not accepted. Send the answers to POST /api/agents/decomposer/clarify.";

/** 404 when the suggestion does not exist, 409 conflict when it is no longer pending. */
function resolutionError(ex: Executor, id: number): AppError {
  const suggestion = findSuggestion(ex, id);
  return suggestion
    ? conflict(`Suggestion ${id} is already ${suggestion.status}`)
    : notFound(`Suggestion ${id} not found`);
}

/** The user's edited payload when there is one, parsed with the kind's schema. */
function acceptedPayload<K extends SuggestionPayloadKind>(
  kind: K,
  stored: SuggestionPayload<K>,
  edited: unknown,
): SuggestionPayload<K> {
  if (edited === undefined) return stored;
  const parsed = parseSuggestionPayload(kind, edited);
  if (parsed.success) return parsed.data;
  throw validationError(
    parsed.error.issues.map((issue) => ({
      path: ["payload", ...issue.path].join("."),
      message: issue.message,
    })),
  );
}

function requireTarget(ex: Executor, taskId: number, baseUpdatedAt: number): TaskRow {
  const task = findTask(ex, taskId);
  if (!task) throw conflict(`Task ${taskId} no longer exists`);
  assertUnchanged(task, baseUpdatedAt);
  return task;
}

const titleKey = (title: string) => title.trim().toLowerCase();

function duplicateTitleIssues(
  task: TaskRow,
  proposed: readonly { title: string }[],
  existingTitles: readonly string[],
) {
  const existing = new Set(existingTitles.map(titleKey));
  const seen = new Set<string>();
  return proposed.flatMap(({ title }, i) => {
    const key = titleKey(title);
    const path = `payload.subtasks.${i}.title`;
    if (existing.has(key)) {
      return [{ path, message: `${task.identifier} already has a subtask titled "${title}"` }];
    }
    if (seen.has(key)) return [{ path, message: `"${title}" is proposed twice` }];
    seen.add(key);
    return [];
  });
}

function acceptSubtasks(
  tx: Executor,
  suggestion: SuggestionOf<"subtasks">,
  input: AcceptSuggestionInput,
  now: number,
): AcceptSuggestionResponse {
  const payload = acceptedPayload("subtasks", suggestion.payload, input.payload);
  const task = requireTarget(tx, suggestion.targetId, input.baseUpdatedAt);
  if (task.parentId !== null) throw conflict(`${task.identifier} is a subtask`);
  if (task.status === "done") throw conflict(`${task.identifier} is done`);
  const existing = listTasks(tx, { parentId: task.id, sort: "createdAt", order: "asc" });
  if (existing.some((subtask) => subtask.createdAt > suggestion.createdAt)) {
    throw conflict(`${task.identifier} already has subtasks added after this suggestion`);
  }
  const issues = duplicateTitleIssues(
    task,
    payload.subtasks,
    existing.map((subtask) => subtask.title),
  );
  if (issues.length > 0) throw validationError(issues);

  const createdTasks = insertSubtasks(tx, task.id, payload.subtasks, now);
  const applied = applySuggestion(tx, suggestion.id, payload, now);
  if (!applied) throw resolutionError(tx, suggestion.id);
  for (const other of listPendingSuggestionsOfTask(tx, task.id)) {
    if (other.kind !== "related") resolveSuggestion(tx, other.id, "superseded", now);
  }
  return { suggestion: applied, createdTasks, createdLinks: [] };
}

/** Larger createdAt is newer; on a tie, the larger id is. */
function newerFirst(a: TaskRow, b: TaskRow): [newer: TaskRow, older: TaskRow] {
  const aIsNewer = a.createdAt === b.createdAt ? a.id > b.id : a.createdAt > b.createdAt;
  return aIsNewer ? [a, b] : [b, a];
}

function acceptRelated(
  tx: Executor,
  suggestion: SuggestionOf<"related">,
  input: AcceptSuggestionInput,
  now: number,
): AcceptSuggestionResponse {
  const payload = acceptedPayload("related", suggestion.payload, input.payload);
  const group = suggestion.payload.taskIds;
  if (
    !payload.taskIds.includes(suggestion.targetId) ||
    payload.taskIds.some((id) => !group.includes(id))
  ) {
    throw invalidField(
      "payload.taskIds",
      `Keep task ${suggestion.targetId} and pick only tasks of the group ${group.join(", ")}`,
    );
  }
  const hub = requireTarget(tx, suggestion.targetId, input.baseUpdatedAt);
  const type = LINK_TYPE_OF[payload.relation];

  const createdLinks = payload.taskIds
    .filter((id) => id !== hub.id)
    .flatMap((id) => {
      const other = findTask(tx, id);
      if (!other) throw conflict(`Task ${id} no longer exists`);
      const [from, to] = type === "duplicates" ? newerFirst(hub, other) : [hub, other];
      if (findLink(tx, from.id, to.id, type) ?? findLink(tx, to.id, from.id, type)) return [];
      return [
        insertLink(tx, {
          fromTaskId: from.id,
          toTaskId: to.id,
          type,
          createdBy: `agent:${suggestion.runId}`,
          createdAt: now,
        }),
      ];
    });

  const applied = applySuggestion(tx, suggestion.id, payload, now);
  if (!applied) throw resolutionError(tx, suggestion.id);
  return { suggestion: applied, createdTasks: [], createdLinks };
}

export function createSuggestionService(db: Db) {
  return {
    list(query: ListSuggestionsQuery): Suggestion[] {
      return listSuggestions(db, query);
    },

    accept(id: number, input: AcceptSuggestionInput): AcceptSuggestionResponse {
      return db.transaction((tx) => {
        const suggestion = findSuggestion(tx, id);
        if (suggestion?.status !== "pending") throw resolutionError(tx, id);
        const now = Date.now();
        switch (suggestion.kind) {
          case "subtasks":
            return acceptSubtasks(tx, suggestion, input, now);
          case "related":
            return acceptRelated(tx, suggestion, input, now);
          case "clarification":
            throw new AppError(400, "validation_error", CLARIFY_INSTEAD);
        }
      });
    },

    reject(id: number): Suggestion {
      return db.transaction((tx) => {
        const rejected = resolveSuggestion(tx, id, "rejected", Date.now());
        if (!rejected) throw resolutionError(tx, id);
        return rejected;
      });
    },
  };
}

export type SuggestionService = ReturnType<typeof createSuggestionService>;
