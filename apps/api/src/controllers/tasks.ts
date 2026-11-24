import type {
  CreateSubtasksInput,
  CreateTaskInput,
  IdParams,
  ListTasksQuery,
  ListTasksResponse,
  TaskDetail,
  UpdateTaskInput,
} from '@postdog/shared';
import type { Request, Response } from 'express';
import type { TaskService } from '../services/tasks';

export function createTaskController(tasks: TaskService) {
  return {
    list: (
      req: Request<unknown, unknown, unknown, ListTasksQuery>,
      res: Response<ListTasksResponse>,
    ) => {
      res.json({ items: tasks.list(req.query) });
    },
    get: (req: Request<IdParams>, res: Response<TaskDetail>) => {
      res.json(tasks.get(req.params.id));
    },
    create: (req: Request<unknown, unknown, CreateTaskInput>, res: Response<TaskDetail>) => {
      res.status(201).json(tasks.create(req.body));
    },
    update: (req: Request<IdParams, unknown, UpdateTaskInput>, res: Response<TaskDetail>) => {
      res.json(tasks.update(req.params.id, req.body));
    },
    remove: (req: Request<IdParams>, res: Response) => {
      tasks.remove(req.params.id);
      res.status(204).end();
    },
    createSubtasks: (
      req: Request<IdParams, unknown, CreateSubtasksInput>,
      res: Response<TaskDetail>,
    ) => {
      res.status(201).json(tasks.createSubtasks(req.params.id, req.body));
    },
  };
}

export type TaskController = ReturnType<typeof createTaskController>;
