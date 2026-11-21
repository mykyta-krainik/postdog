import type {
  CreateSubtasksInput,
  CreateTaskInput,
  ListTasksQuery,
  TaskDetail,
  TaskListItem,
  UpdateTaskInput,
} from "@postdog/shared";
import type { Db, Executor } from "../db/client";
import type { NewTaskRow, TaskRow } from "../db/schema";
import { invalidField, notFound, stale } from "../lib/errors";
import { listLinksOfTask } from "../repositories/links";
import { getSetting, setSetting } from "../repositories/settings";
import { deleteTask, findTask, insertTask, listTasks, updateTask } from "../repositories/tasks";

/** Reserves the next `count` identifiers ("PD-n") from the counter in settings. */
export function allocateIdentifiers(ex: Executor, count: number): string[] {
  const last = getSetting(ex, "identifierCounter") ?? 0;
  setSetting(ex, "identifierCounter", last + count);
  return Array.from({ length: count }, (_, i) => `PD-${last + i + 1}`);
}

/**
 * The columns a PATCH writes, or undefined when nothing changes. Only a real change
 * to a user field bumps updatedAt, and only a real status change bumps statusChangedAt.
 */
export function planTaskUpdate(
  task: TaskRow,
  input: UpdateTaskInput,
  now: number,
): Partial<NewTaskRow> | undefined {
  const fields = Object.keys(input) as (keyof UpdateTaskInput)[];
  const changed = fields.filter((field) => input[field] !== task[field]);
  if (changed.length === 0) return undefined;

  const changes = Object.fromEntries(changed.map((field) => [field, input[field]]));
  return {
    ...changes,
    updatedAt: now,
    ...(changed.includes("status") && { statusChangedAt: now }),
  };
}

function requireTask(ex: Executor, id: number): TaskRow {
  const task = findTask(ex, id);
  if (!task) throw notFound(`Task ${id} not found`);
  return task;
}

function toDetail(ex: Executor, task: TaskRow): TaskDetail {
  return {
    ...task,
    subtasks: listTasks(ex, { parentId: task.id, sort: "createdAt", order: "asc" }),
    links: listLinksOfTask(ex, task.id),
  };
}

export function createTaskService(db: Db) {
  return {
    list(query: ListTasksQuery): TaskListItem[] {
      return listTasks(db, {
        parentId: query.parentId ?? null,
        status: query.status,
        search: query.q,
        sort: query.sort,
        order: query.order,
      });
    },

    get(id: number): TaskDetail {
      return toDetail(db, requireTask(db, id));
    },

    create(input: CreateTaskInput): TaskDetail {
      return db.transaction((tx) => {
        const { parentId, ...fields } = input;
        if (parentId !== undefined) {
          const parent = findTask(tx, parentId);
          if (!parent) throw invalidField("parentId", `Task ${parentId} does not exist`);
          if (parent.parentId !== null) {
            throw invalidField("parentId", "A subtask cannot have subtasks of its own");
          }
        }
        const now = Date.now();
        const [identifier] = allocateIdentifiers(tx, 1) as [string];
        const task = insertTask(tx, {
          ...fields,
          identifier,
          parentId: parentId ?? null,
          createdAt: now,
          updatedAt: now,
          statusChangedAt: now,
        });
        return toDetail(tx, task);
      });
    },

    update(id: number, input: UpdateTaskInput): TaskDetail {
      return db.transaction((tx) => {
        const task = requireTask(tx, id);
        const changes = planTaskUpdate(task, input, Date.now());
        if (changes) updateTask(tx, id, changes);
        return toDetail(tx, requireTask(tx, id));
      });
    },

    remove(id: number): void {
      if (!deleteTask(db, id)) throw notFound(`Task ${id} not found`);
    },

    createSubtasks(id: number, input: CreateSubtasksInput): TaskDetail {
      return db.transaction((tx) => {
        const parent = requireTask(tx, id);
        if (parent.parentId !== null) {
          throw invalidField("id", "A subtask cannot have subtasks of its own");
        }
        if (parent.updatedAt !== input.baseUpdatedAt) {
          throw stale(`Task ${parent.identifier} changed since it was loaded`);
        }
        const now = Date.now();
        const identifiers = allocateIdentifiers(tx, input.subtasks.length);
        input.subtasks.forEach((subtask, i) => {
          insertTask(tx, {
            ...subtask,
            identifier: identifiers[i]!,
            status: "todo",
            parentId: parent.id,
            createdAt: now,
            updatedAt: now,
            statusChangedAt: now,
          });
        });
        return toDetail(tx, parent);
      });
    },
  };
}

export type TaskService = ReturnType<typeof createTaskService>;
