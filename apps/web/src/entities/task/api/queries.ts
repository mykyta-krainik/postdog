'use client';

import { listTasksResponseSchema, taskDetailSchema } from '@postdog/shared';
import useSWR from 'swr';
import { fetcherFor } from '@/shared/api';
import { taskKeys, type TaskListQuery } from './keys';

const fetchTaskList = fetcherFor(listTasksResponseSchema);
const fetchTaskDetail = fetcherFor(taskDetailSchema);

/** Top-level tasks by default, or the subtasks of query.parentId. keepPreviousData avoids a flash while the query changes. */
export function useTasks(query: TaskListQuery = {}) {
  return useSWR(taskKeys.list(query), fetchTaskList, { keepPreviousData: true });
}

/** One task with its subtasks and links. Pass undefined to skip the request. */
export function useTask(id: number | undefined) {
  return useSWR(id === undefined ? null : taskKeys.detail(id), fetchTaskDetail);
}
