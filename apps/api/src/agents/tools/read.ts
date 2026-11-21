import {
  getTaskInputSchema,
  getTaskNotesInputSchema,
  searchTasksInputSchema,
  type TaskDetailLink,
} from "@postdog/shared";
import type { Executor } from "../../db/client";
import type { TaskRow } from "../../db/schema";
import { listLinksOfTask } from "../../repositories/links";
import { listLatestNotes } from "../../repositories/notes";
import { findTask, listTasks, searchTasks } from "../../repositories/tasks";
import { wholeDaysBetween } from "../context";
import { ToolError } from "../core/errors";
import { defineReadTool } from "../core/tool";

export const TEXT_LIMIT = 1500;
const LIST_LIMIT = 50;

function cut(text: string): { text: string; truncated: boolean } {
  return text.length <= TEXT_LIMIT
    ? { text, truncated: false }
    : { text: text.slice(0, TEXT_LIMIT), truncated: true };
}

function requireTask(ex: Executor, id: number): TaskRow {
  const task = findTask(ex, id);
  if (!task) throw new ToolError(`Task ${id} not found. Use search_tasks to find valid IDs.`);
  return task;
}

function relation(link: TaskDetailLink): string {
  if (link.type === "relates") return "relates";
  if (link.type === "blocks") return link.direction === "out" ? "blocks" : "blocked_by";
  return link.direction === "out" ? "duplicates" : "duplicated_by";
}

export function createReadTools(ex: Executor, now: () => number = Date.now) {
  const getTask = defineReadTool({
    name: "get_task",
    description: [
      "Get one task by its numeric id: description, status, priority, age, subtasks and links (blocks, blocked_by, relates, duplicates, duplicated_by).",
      "Use it when you need details the table in the message does not show, such as the description or what blocks a task.",
      "Do not use it to find tasks by words; use search_tasks for that.",
      'Example: {"id": 12}.',
    ].join(" "),
    input: getTaskInputSchema,
    run: ({ id }) => {
      const task = requireTask(ex, id);
      const description = cut(task.description);
      const subtasks = listTasks(ex, { parentId: task.id, sort: "createdAt", order: "asc" });
      const links = listLinksOfTask(ex, task.id);
      const at = now();
      return {
        id: task.id,
        identifier: task.identifier,
        title: task.title,
        status: task.status,
        priority: task.priority,
        parentId: task.parentId,
        aiState: task.aiState,
        ageDays: wholeDaysBetween(task.createdAt, at),
        daysInStatus: wholeDaysBetween(task.statusChangedAt, at),
        description: description.text,
        subtasks: subtasks.slice(0, LIST_LIMIT).map((s) => ({
          id: s.id,
          identifier: s.identifier,
          title: s.title,
          status: s.status,
        })),
        links: links.slice(0, LIST_LIMIT).map((link) => ({
          relation: relation(link),
          id: link.task.id,
          identifier: link.task.identifier,
          title: link.task.title,
          status: link.task.status,
        })),
        ...((description.truncated ||
          subtasks.length > LIST_LIMIT ||
          links.length > LIST_LIMIT) && { truncated: true }),
      };
    },
    summarize: (task) => `${task.identifier} ${task.title} (${task.status})`,
  });

  const searchTasksTool = defineReadTool({
    name: "search_tasks",
    description: [
      "Find tasks of any level (top-level tasks and subtasks) whose title or description contains every given word, most recently updated first.",
      "Use it to find a task's id, related work or possible duplicates.",
      "Do not use it to read one task you already have the id of; use get_task for that.",
      'Example: {"query": "rate limit", "status": "todo", "limit": 5}.',
    ].join(" "),
    input: searchTasksInputSchema,
    run: ({ query, status, limit }) => {
      const words = query.split(/\s+/).filter(Boolean).slice(0, 10);
      const rows = searchTasks(ex, { words, status, limit: limit + 1 });
      const tasks = rows.slice(0, limit).map((t) => ({
        id: t.id,
        identifier: t.identifier,
        title: t.title,
        status: t.status,
        priority: t.priority,
        parentId: t.parentId,
      }));
      return {
        tasks,
        ...(rows.length > limit && { truncated: true }),
        ...(tasks.length === 0 && {
          hint: `No tasks match "${query}"${status ? ` with status ${status}` : ""}. Try fewer or different words.`,
        }),
      };
    },
    summarize: ({ tasks }) =>
      tasks.length === 0
        ? "No tasks found"
        : `${tasks.length} tasks: ${tasks.map((t) => t.identifier).join(", ")}`,
  });

  const getTaskNotes = defineReadTool({
    name: "get_task_notes",
    description: [
      "Get the progress and completion notes people wrote on one task, newest first.",
      "Use it to learn what actually happened on a task, optionally only since a time in ms since the epoch.",
      "Do not use it for the task's own fields or subtasks; use get_task for those.",
      'Example: {"taskId": 12, "since": 1763600000000, "limit": 10}.',
    ].join(" "),
    input: getTaskNotesInputSchema,
    run: ({ taskId, since, limit }) => {
      const task = requireTask(ex, taskId);
      const rows = listLatestNotes(ex, taskId, { since, limit: limit + 1 });
      return {
        taskId: task.id,
        identifier: task.identifier,
        notes: rows.slice(0, limit).map((note) => {
          const body = cut(note.body);
          return {
            id: note.id,
            createdAt: new Date(note.createdAt).toISOString(),
            body: body.text,
            ...(body.truncated && { truncated: true }),
          };
        }),
        ...(rows.length > limit && { truncated: true }),
      };
    },
    summarize: ({ identifier, notes }) =>
      `${notes.length} ${notes.length === 1 ? "note" : "notes"} on ${identifier}`,
  });

  return { getTask, searchTasks: searchTasksTool, getTaskNotes };
}
