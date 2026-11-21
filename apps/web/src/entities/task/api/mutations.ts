import {
  createSubtasksInputSchema,
  createTaskInputSchema,
  taskDetailSchema,
  type TaskDetail,
  type UpdateTaskInput,
} from "@postdog/shared";
import { mutate } from "swr";
import { z } from "zod";
import { apiKey, apiRequest } from "@/shared/api";
import { isOptimisticPatch, patchTaskCache, type TaskCacheEntry } from "../model/optimistic";
import { taskKeys } from "./keys";

export type CreateTaskValues = z.input<typeof createTaskInputSchema>;
export type CreateSubtasksValues = z.input<typeof createSubtasksInputSchema>;

/** Refetches every mounted list and detail. Others refetch when they mount again. */
function revalidateTasks(except?: string) {
  return mutate((key) => taskKeys.holdsTasks(key) && key !== except);
}

export async function createTask(input: CreateTaskValues): Promise<TaskDetail> {
  const created = await apiRequest(apiKey("/tasks"), taskDetailSchema, {
    method: "POST",
    body: input,
  });
  await mutate(taskKeys.detail(created.id), created, { revalidate: false });
  await revalidateTasks(taskKeys.detail(created.id));
  return created;
}

/**
 * A status or priority change shows at once in every cached list and detail, and rolls back if
 * the API rejects it. Other changes show after the API answers.
 */
export async function updateTask(id: number, patch: UpdateTaskInput): Promise<TaskDetail> {
  const request = apiRequest(taskKeys.detail(id), taskDetailSchema, {
    method: "PATCH",
    body: patch,
  });
  if (isOptimisticPatch(patch)) {
    await mutate<TaskCacheEntry | undefined, TaskDetail>(taskKeys.holdsTasks, request, {
      optimisticData: (_committed, displayed) => patchTaskCache(displayed, id, patch),
      rollbackOnError: true,
      populateCache: false,
      revalidate: true,
    });
    return request;
  }
  const updated = await request;
  await revalidateTasks();
  return updated;
}

export async function deleteTask(id: number): Promise<void> {
  await apiRequest(taskKeys.detail(id), z.undefined(), { method: "DELETE" });
  await mutate(taskKeys.detail(id), undefined, { revalidate: false });
  await revalidateTasks(taskKeys.detail(id));
}

/** Creates subtasks in one transaction. Returns the parent with its new subtasks. */
export async function createSubtasks(
  parentId: number,
  input: CreateSubtasksValues,
): Promise<TaskDetail> {
  const parent = await apiRequest(apiKey(`/tasks/${parentId}/subtasks`), taskDetailSchema, {
    method: "POST",
    body: input,
  });
  await mutate(taskKeys.detail(parentId), parent, { revalidate: false });
  await revalidateTasks(taskKeys.detail(parentId));
  return parent;
}
