import {
  createSubtasksInputSchema,
  createTaskInputSchema,
  idParamsSchema,
  listTasksQuerySchema,
  updateTaskInputSchema,
} from "@postdog/shared";
import { Router } from "express";
import type { TaskController } from "../controllers/tasks";
import { validate } from "../middleware/validate";

export function taskRoutes(tasks: TaskController): Router {
  const byId = { params: idParamsSchema };
  return Router()
    .get("/tasks", validate({ query: listTasksQuerySchema }), tasks.list)
    .post("/tasks", validate({ body: createTaskInputSchema }), tasks.create)
    .get("/tasks/:id", validate(byId), tasks.get)
    .patch("/tasks/:id", validate({ ...byId, body: updateTaskInputSchema }), tasks.update)
    .delete("/tasks/:id", validate(byId), tasks.remove)
    .post(
      "/tasks/:id/subtasks",
      validate({ ...byId, body: createSubtasksInputSchema }),
      tasks.createSubtasks,
    );
}
