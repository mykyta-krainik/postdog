/** The search param on /tasks that holds the selected task id. */
export const SELECTED_TASK_PARAM = "task";

/** The search param on /runs that holds the open run id. */
export const OPEN_RUN_PARAM = "run";

export const routes = {
  today: "/today",
  tasks: "/tasks",
  task: (id: number) => `/tasks?${SELECTED_TASK_PARAM}=${id}`,
  runs: "/runs",
  run: (id: number) => `/runs?${OPEN_RUN_PARAM}=${id}`,
  inbox: "/inbox",
  settings: "/settings",
} as const;
