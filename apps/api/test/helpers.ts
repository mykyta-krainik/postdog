import {
  listTasksResponseSchema,
  taskDetailSchema,
  type CreateTaskInput,
  type TaskDetail,
  type TaskListItem,
} from "@postdog/shared";
import request from "supertest";
import { vi } from "vitest";
import { createApp } from "../src/app";
import { IN_MEMORY, openDatabase } from "../src/db/client";
import { migrateDatabase } from "../src/db/migrate";

export type Api = ReturnType<typeof request>;

/** A fresh, migrated, unseeded in-memory database behind the real app. */
export function createTestApi(): Api {
  const db = openDatabase(IN_MEMORY);
  migrateDatabase(db);
  return request(createApp(db));
}

export async function createTask(
  api: Api,
  body: Partial<CreateTaskInput> = {},
): Promise<TaskDetail> {
  const res = await api
    .post("/api/tasks")
    .send({ title: "Task", ...body })
    .expect(201);
  return taskDetailSchema.parse(res.body);
}

export async function getTask(api: Api, id: number): Promise<TaskDetail> {
  const res = await api.get(`/api/tasks/${id}`).expect(200);
  return taskDetailSchema.parse(res.body);
}

export async function listTasks(api: Api, query: string = ""): Promise<TaskListItem[]> {
  const res = await api.get(`/api/tasks${query}`).expect(200);
  return listTasksResponseSchema.parse(res.body).items;
}

/** Freezes Date.now() at `ms`; timers keep running so HTTP still works. */
export function setNow(ms: number): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(ms);
}
