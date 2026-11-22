/** The search param on /tasks that holds the selected task id. */
export const SELECTED_TASK_PARAM = "task";

export const routes = {
  today: "/today",
  tasks: "/tasks",
  task: (id: number) => `/tasks?${SELECTED_TASK_PARAM}=${id}`,
  inbox: "/inbox",
  settings: "/settings",
} as const;
