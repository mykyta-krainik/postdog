import { updateTaskInputSchema, type UpdateTaskInput } from "@postdog/shared";
import type { z } from "zod";

/** Title and description with the PATCH rules, both required in the form. */
export const taskContentSchema = updateTaskInputSchema
  .pick({ title: true, description: true })
  .required();

export type TaskContentValues = z.input<typeof taskContentSchema>;

/**
 * The PATCH body for the fields that differ from the saved task. Empty when nothing changed.
 * Titles compare trimmed, the way the API stores them. Description whitespace is markdown, so it counts.
 */
export function contentPatch(values: TaskContentValues, saved: TaskContentValues): UpdateTaskInput {
  const patch: UpdateTaskInput = {};
  const title = values.title.trim();
  if (title !== saved.title) patch.title = title;
  if (values.description !== saved.description) patch.description = values.description;
  return patch;
}

/**
 * The form values after the saved task changed from `previous` to `next`, for example in another tab.
 * A field the user has not edited follows the new value. An edited field keeps the user's text.
 */
export function rebaseContent(
  previous: TaskContentValues,
  next: TaskContentValues,
  current: TaskContentValues,
): TaskContentValues {
  const edited = contentPatch(current, previous);
  return {
    title: "title" in edited ? current.title : next.title,
    description: "description" in edited ? current.description : next.description,
  };
}
