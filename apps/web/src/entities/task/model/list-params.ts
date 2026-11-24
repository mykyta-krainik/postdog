import {
  idParamsSchema,
  sortOrderSchema,
  taskSortSchema,
  taskStatusSchema,
  type SortOrder,
  type TaskSort,
  type TaskStatus,
} from '@postdog/shared';
import { SELECTED_TASK_PARAM, routes } from '@/shared/config';
import type { TaskListQuery } from '../api/keys';

/** The Tasks page state that lives in the URL, so it survives a reload and a shared link. */
export type TaskListParams = {
  status: TaskStatus | undefined;
  sort: TaskSort;
  order: SortOrder;
  q: string;
  selectedTaskId: number | undefined;
};

export const DEFAULT_TASK_LIST_PARAMS: TaskListParams = {
  status: undefined,
  sort: 'createdAt',
  order: 'desc',
  q: '',
  selectedTaskId: undefined,
};

const MAX_QUERY_LENGTH = 200;

type SearchParamsReader = { get(name: string): string | null };

/** Reads the list state from search params. A missing or invalid value falls back to its default. */
export function parseTaskListParams(search: SearchParamsReader): TaskListParams {
  return {
    status: taskStatusSchema.safeParse(search.get('status')).data,
    sort: taskSortSchema.safeParse(search.get('sort')).data ?? DEFAULT_TASK_LIST_PARAMS.sort,
    order: sortOrderSchema.safeParse(search.get('order')).data ?? DEFAULT_TASK_LIST_PARAMS.order,
    q: (search.get('q') ?? '').slice(0, MAX_QUERY_LENGTH),
    selectedTaskId: idParamsSchema.shape.id.safeParse(search.get(SELECTED_TASK_PARAM) ?? '').data,
  };
}

/** Writes the list state as a query string. Defaults are left out to keep shared links short. */
export function serializeTaskListParams(params: TaskListParams): string {
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
  if (params.sort !== DEFAULT_TASK_LIST_PARAMS.sort) search.set('sort', params.sort);
  if (params.order !== DEFAULT_TASK_LIST_PARAMS.order) search.set('order', params.order);
  const q = params.q.trim();
  if (q) search.set('q', q);
  if (params.selectedTaskId !== undefined) {
    search.set(SELECTED_TASK_PARAM, String(params.selectedTaskId));
  }
  return search.toString();
}

export function taskListHref(params: TaskListParams): string {
  const search = serializeTaskListParams(params);
  return search ? `${routes.tasks}?${search}` : routes.tasks;
}

export function toListTasksQuery({ status, sort, order, q }: TaskListParams): TaskListQuery {
  return { status, sort, order, q };
}

export function hasActiveFilters(params: TaskListParams): boolean {
  return params.status !== undefined || params.q.trim() !== '';
}
