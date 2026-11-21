export type {
  AiState,
  CreateTaskInput,
  ListTasksResponse,
  Priority,
  Task,
  TaskDetail,
  TaskListItem,
  TaskStatus,
  UpdateTaskInput,
} from "@postdog/shared";

export { AI_ATTENTION_HINT, shouldShowAiDot } from "./model/ai-attention";
export {
  DEFAULT_TASK_LIST_PARAMS,
  hasActiveFilters,
  parseTaskListParams,
  serializeTaskListParams,
  taskListHref,
  toListTasksQuery,
  type TaskListParams,
} from "./model/list-params";
export { isOptimisticPatch, patchTaskCache, type OptimisticTaskPatch } from "./model/optimistic";
export { TASK_STATUS_ORDER, groupTasksByStatus, type TaskGroup } from "./model/status";
export { useTaskListParams, type SetTaskListParams } from "./model/use-task-list-params";

export { taskKeys, type TaskListQuery } from "./api/keys";
export {
  createSubtasks,
  createTask,
  deleteTask,
  updateTask,
  type CreateSubtasksValues,
  type CreateTaskValues,
} from "./api/mutations";
export { useTask, useTasks } from "./api/queries";

export { AiDot } from "./ui/ai-dot";
export { PriorityIcon, TASK_PRIORITY_META } from "./ui/priority-icon";
export { StatusIcon, TASK_STATUS_META } from "./ui/status-icon";
export { TaskRow } from "./ui/task-row";
