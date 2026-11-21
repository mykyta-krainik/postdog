import { listTasksQuerySchema } from "@postdog/shared";
import type { z } from "zod";
import { apiKey } from "@/shared/api";

/** What a caller passes to the list endpoint. Defaults for sort and order apply when left out. */
export type TaskListQuery = z.input<typeof listTasksQuerySchema>;

const DETAIL_KEY = /^\/api\/tasks\/\d+$/;

export const taskKeys = {
  /** The list key is normalized through the contract schema, so equal queries share one cache entry. */
  list: (query: TaskListQuery = {}) => apiKey("/tasks", listTasksQuerySchema.parse(query)),
  detail: (id: number) => apiKey(`/tasks/${id}`),
  notes: (id: number) => apiKey(`/tasks/${id}/notes`),

  isList: (key: unknown) =>
    typeof key === "string" && (key === "/api/tasks" || key.startsWith("/api/tasks?")),
  isDetail: (key: unknown) => typeof key === "string" && DETAIL_KEY.test(key),
  /** Keys whose data holds task rows: every list and every detail. Notes and other sub-resources are not included. */
  holdsTasks: (key: unknown) => taskKeys.isList(key) || taskKeys.isDetail(key),
};
