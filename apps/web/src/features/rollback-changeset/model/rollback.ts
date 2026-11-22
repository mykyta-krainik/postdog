import {
  rollbackResponseSchema,
  type RollbackInput,
  type RollbackKeptItem,
  type RollbackResponse,
} from "@postdog/shared";
import { KEPT_REASON_TEXT, revalidateNotifications } from "@/entities/notification";
import { revalidateSuggestions } from "@/entities/suggestion";
import { ApiError, apiKey, apiRequest } from "@/shared/api";

/** A whole changeset without taskId, or one task's part of it. */
export type RollbackTarget = { changesetId: number; taskId?: number };

export function rollbackRequest({ changesetId, taskId }: RollbackTarget): {
  url: string;
  body: RollbackInput;
} {
  return {
    url: apiKey(`/changesets/${changesetId}/rollback`),
    body: taskId === undefined ? {} : { taskId },
  };
}

/**
 * Deletes what the changeset created and the user left untouched. Then refetches the
 * notifications, the badge, every task list and detail, and the suggestions, whatever the answer.
 */
export async function rollbackChangeset(target: RollbackTarget): Promise<RollbackResponse> {
  const { url, body } = rollbackRequest(target);
  try {
    return await apiRequest(url, rollbackResponseSchema, { method: "POST", body });
  } finally {
    await Promise.all([revalidateNotifications(), revalidateSuggestions()]);
  }
}

export function rollbackErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return "Something went wrong. Try again.";
  switch (error.code) {
    case "not_found":
      return "This change is gone, so there is nothing to roll back.";
    case "conflict":
      return "This was already rolled back. The Inbox now shows what is left.";
    case "validation_error":
      return "That task is no longer part of this change.";
    case "network_error":
      return "Postdog can't reach the API. Try again in a moment.";
    default:
      return error.message;
  }
}

/** A kept item as "PD-14 Write the tests" and "has notes". */
export function keptItemText(item: RollbackKeptItem): { name: string; reason: string } {
  const reason = KEPT_REASON_TEXT[item.reason];
  const task = [item.identifier, item.title].filter(Boolean).join(" ");
  if (item.type === "create_link") {
    return { name: task ? `The link on ${task}` : "A link", reason };
  }
  return { name: task || "A subtask", reason };
}
