/** The search param on /tasks that holds the selected task id. */
export const SELECTED_TASK_PARAM = "task";

export const routes = {
  tasks: "/tasks",
  task: (id: number) => `/tasks?${SELECTED_TASK_PARAM}=${id}`,
  settings: "/settings",
} as const;
