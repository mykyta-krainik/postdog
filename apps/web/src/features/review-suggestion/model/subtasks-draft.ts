import {
  AGENT_LIMITS,
  subtasksPayloadSchema,
  type Priority,
  type SubtasksPayload,
} from "@postdog/shared";

/** subtasksPayloadSchema's bounds. The schema stays the check; these word the messages. */
export const MIN_SUBTASKS = 2;
export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 1500;

export const MIN_SUBTASKS_MESSAGE = `A split needs at least ${MIN_SUBTASKS} subtasks. Reject the suggestion instead.`;

/** One proposed subtask as the user edits it. `key` is its index in the suggestion, so it survives removals. */
export type DraftItem = {
  key: number;
  title: string;
  description: string;
  priority: Priority | undefined;
};

/** `removeBlocked` is set when a removal would go below the minimum, until the next edit. */
export type SubtasksDraft = { items: DraftItem[]; removeBlocked: boolean };

export type DraftAction =
  | { type: "edit"; key: number; field: "title" | "description"; value: string }
  | { type: "priority"; key: number; value: Priority }
  | { type: "remove"; key: number };

export function initialDraft(payload: SubtasksPayload): SubtasksDraft {
  return {
    items: payload.subtasks.map((subtask, key) => ({
      key,
      title: subtask.title,
      description: subtask.description,
      priority: subtask.priority,
    })),
    removeBlocked: false,
  };
}

/** Edit a title, a description or a priority, or remove an item. Nothing can be added. */
export function draftReducer(draft: SubtasksDraft, action: DraftAction): SubtasksDraft {
  switch (action.type) {
    case "edit":
      return {
        items: draft.items.map((item) =>
          item.key === action.key ? { ...item, [action.field]: action.value } : item,
        ),
        removeBlocked: false,
      };
    case "priority":
      return {
        items: draft.items.map((item) =>
          item.key === action.key ? { ...item, priority: action.value } : item,
        ),
        removeBlocked: false,
      };
    case "remove":
      if (draft.items.length <= MIN_SUBTASKS) return { ...draft, removeBlocked: true };
      return { items: draft.items.filter((item) => item.key !== action.key), removeBlocked: false };
  }
}

export type ItemErrors = { title?: string; description?: string };

export type DraftCheck =
  | { ok: true; payload: SubtasksPayload }
  | { ok: false; items: Record<number, ItemErrors>; list?: string };

function fieldMessage(field: "title" | "description", code: string): string {
  if (field === "title") {
    return code === "too_small" ? "Give it a title." : `Keep titles under ${TITLE_MAX} characters.`;
  }
  return `Keep the description under ${DESCRIPTION_MAX.toLocaleString("en")} characters.`;
}

/** Checks the draft with the shared payload schema, so the API gets what it would accept. */
export function checkDraft(draft: SubtasksDraft, rationale: string): DraftCheck {
  const parsed = subtasksPayloadSchema.safeParse({
    subtasks: draft.items.map(({ title, description, priority }) => ({
      title,
      description,
      ...(priority && { priority }),
    })),
    rationale,
  });
  if (parsed.success) return { ok: true, payload: parsed.data };

  const items: Record<number, ItemErrors> = {};
  let list: string | undefined;
  for (const issue of parsed.error.issues) {
    const [root, index, field] = issue.path;
    if (root !== "subtasks") continue;
    if (typeof index !== "number") {
      list =
        issue.code === "too_small"
          ? MIN_SUBTASKS_MESSAGE
          : `A split has at most ${AGENT_LIMITS.maxSubtasks} subtasks.`;
      continue;
    }
    const item = draft.items[index];
    if (item && (field === "title" || field === "description")) {
      items[item.key] = { ...items[item.key], [field]: fieldMessage(field, issue.code) };
    }
  }
  return { ok: false, items, list };
}

function sameSubtasks(a: SubtasksPayload, b: SubtasksPayload): boolean {
  return (
    a.subtasks.length === b.subtasks.length &&
    a.subtasks.every((subtask, index) => {
      const other = b.subtasks[index];
      return (
        other !== undefined &&
        subtask.title.trim() === other.title.trim() &&
        subtask.description === other.description &&
        (subtask.priority ?? "medium") === (other.priority ?? "medium")
      );
    })
  );
}

/**
 * The payload to send on accept: the edited one only when the user changed something, else
 * undefined, so the API applies the stored suggestion. A missing priority means medium.
 */
export function editedPayload(
  original: SubtasksPayload,
  edited: SubtasksPayload,
): SubtasksPayload | undefined {
  return sameSubtasks(original, edited) ? undefined : edited;
}
