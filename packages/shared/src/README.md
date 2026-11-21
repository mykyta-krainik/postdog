# @postdog/shared

The HTTP contract between `apps/api` and `apps/web`. Each request and response shape is a Zod schema in this package. The API validates requests with these schemas, and the web app builds its forms and types from them.

## Imports

Import everything from `@postdog/shared`. The package has no build step, and `exports` points at `src/index.ts`. The API runs the source under tsx. The web app compiles it through `transpilePackages`.

## Naming

- A Zod schema name ends in `Schema`, such as `createTaskInputSchema`.
- The inferred type drops the suffix and uses PascalCase, such as `CreateTaskInput`.
- Each domain enum is also an `as const` array, such as `TASK_STATUSES`, for Drizzle column enums.
- Ids are positive integers. Timestamps are integer milliseconds since the epoch.

## Responses

- A list endpoint returns `{ items: [...] }`.
- A single resource is returned directly, with no wrapper.
- `DELETE` returns `204` with no body.
- Every error returns `{ error: { code, message, details? } }`, as `apiErrorBodySchema` describes.

## Endpoints in phase 1

Every `:id` route param is parsed with `idParamsSchema`.

| Method and path                | Request                          | Success                                     |
| ------------------------------ | -------------------------------- | ------------------------------------------- |
| `GET /api/tasks`               | query `listTasksQuerySchema`     | 200 `listTasksResponseSchema`               |
| `POST /api/tasks`              | body `createTaskInputSchema`     | 201 `taskDetailSchema`                      |
| `GET /api/tasks/:id`           |                                  | 200 `taskDetailSchema`                      |
| `PATCH /api/tasks/:id`         | body `updateTaskInputSchema`     | 200 `taskDetailSchema`                      |
| `DELETE /api/tasks/:id`        |                                  | 204                                         |
| `POST /api/tasks/:id/subtasks` | body `createSubtasksInputSchema` | 201 `taskDetailSchema` of the parent        |
| `GET /api/tasks/:id/notes`     |                                  | 200 `listNotesResponseSchema`, oldest first |
| `POST /api/tasks/:id/notes`    | body `createNoteInputSchema`     | 201 `taskNoteSchema`                        |
| `POST /api/tasks/:id/links`    | body `createLinkInputSchema`     | 201 `taskLinkSchema`                        |
| `DELETE /api/links/:id`        |                                  | 204                                         |
| `GET /api/settings`            |                                  | 200 `settingsSchema`                        |
| `PATCH /api/settings`          | body `updateSettingsInputSchema` | 200 `settingsSchema`                        |

A `PATCH` body holds only the fields to change. `updateTaskInputSchema` and `updateSettingsInputSchema` apply no defaults.

## Endpoints in phase 2

Every route under `/api/agents` answers `403 ai_disabled` while `aiEnabled` is false.

| Method and path                       | Request                          | Success                                             |
| ------------------------------------- | -------------------------------- | --------------------------------------------------- |
| `POST /api/agents/planner/run`        | body `plannerInputSchema` (`{}`) | 202 `startRunResponseSchema`                        |
| `POST /api/agents/status-updater/run` | body `statusUpdaterInputSchema`  | 202 `startRunResponseSchema`                        |
| `GET /api/agents/runs`                | query `listAgentRunsQuerySchema` | 200 `listAgentRunsResponseSchema`, newest first     |
| `GET /api/agents/runs/:id`            |                                  | 200 `agentRunSchema`                                |
| `POST /api/agents/runs/:id/cancel`    |                                  | 200 `agentRunSchema`, 409 `conflict` if not running |
| `GET /api/agents/info`                |                                  | 200 `agentsInfoSchema`                              |
| `GET /api/agents/planner/latest`      |                                  | 200 `plannerLatestResponseSchema`                   |

Runs are asynchronous. A `run` route answers `{ runId }` at once, and the client polls `GET /api/agents/runs/:id` until `status` is no longer `running`.

## Errors

| Code                         | Status | Returned when                                                                                                                           |
| ---------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `validation_error`           | 400    | A body, query or param fails its schema, or an id in the body breaks a rule: an unknown task, a subtask of a subtask, a link to itself. |
| `not_found`                  | 404    | The `:id` in the path does not exist.                                                                                                   |
| `conflict`                   | 409    | The new link already exists, or the run to cancel is not running.                                                                       |
| `stale`                      | 409    | `baseUpdatedAt` differs from the target task's `updatedAt`.                                                                             |
| `ai_disabled`                | 403    | An agent or suggestion route is called while `aiEnabled` is false.                                                                      |
| `agent_failed`, `step_limit` |        | Reserved. A failed run is still a 200 response, with its reason in `AgentRun.error` (see Agent runs).                                   |
| `internal_error`             | 500    | The server failed in a way the request did not cause.                                                                                   |

When a schema fails, `details` matches `validationErrorDetailsSchema`. Each issue has a dotted `path`, such as `subtasks.0.title`, which is also the React Hook Form field name.

## Task list query

- Without `parentId`, the list holds top-level tasks only. With `parentId`, the list holds the subtasks of that task.
- `sort` defaults to `createdAt`, and `order` defaults to `desc`.
- With `sort=priority`, `desc` puts `high` first. `PRIORITY_RANK` gives the order.
- An empty or whitespace-only `q` means no search.

## Link direction

`TaskDetail.links` holds the links of the viewed task in both directions.

- `direction: "out"` means the viewed task is `fromTaskId`. `direction: "in"` means the viewed task is `toTaskId`.
- For `blocks`, an outgoing link reads "blocks", and an incoming link reads "blocked by".
- For `duplicates`, the `fromTaskId` task is the newer task, and it duplicates the older `toTaskId` task.
- A `relates` link is symmetric and stored once, so its direction has no meaning. A new `relates` link from B to A is a `conflict` when A to B exists.

## Agent runs

- `AgentRun` is one `agent_runs` row. `AgentRunSummary` is the same row without `input`, `output` and `trace`, for lists.
- `mode` is always `null` in phase 2. Only the Decomposer sets it.
- `promptVersion` names the prompt constant, such as `PLANNER_PROMPT_V1`.
- `error` is `null` unless `status` is `failed` or `cancelled`. Its `code` comes from `AGENT_ERROR_CODES`, not `ERROR_CODES`.
- `trace` holds one `TraceStep` per step, 1-based. `input` is a truncated string, and `tokens` is set on `llm` steps only.
- `llm` records the model layer the run used. `GET /api/agents/info` returns the one in use now, for the "Mock AI" badge.
- `input` and `output` are `unknown` on `agentRunSchema`. To read them, parse the run with `plannerRunSchema` or `statusUpdaterRunSchema`, picked by `agent`.
- `AGENT_LIMITS` in `config.ts` holds the loop limits and the per-agent caps.

## Agent tools

The schemas a tool validates its input with live here, so the API builds each tool from them and the model sees their field descriptions.

| Tool                   | Input schema                    | Kind     |
| ---------------------- | ------------------------------- | -------- |
| `get_task`             | `getTaskInputSchema`            | read     |
| `search_tasks`         | `searchTasksInputSchema`        | read     |
| `get_task_notes`       | `getTaskNotesInputSchema`       | read     |
| `submit_daily_plan`    | `submitDailyPlanInputSchema`    | terminal |
| `submit_status_update` | `submitStatusUpdateInputSchema` | terminal |
| `ask_for_notes`        | `askForNotesInputSchema`        | terminal |

The Planner uses `get_task` and `search_tasks`. The Status updater uses all three read tools.

## Planner

- `PlannerContextRow` is one row of the candidate table that code computes for every task that is not done. Day counts are whole days. At most `AGENT_LIMITS.maxPlannerCandidates` rows go to the model.
- The model ends with `submit_daily_plan`. Code drops focus items whose task does not exist, is done or is blocked by an open task, and turns each drop into a warning.
- `PlannerOutput` is the stored plan. Code adds `identifier` and `title` to every focus item. The run fails with `nothing_valid` when no focus item is left.
- `coordinationNotes` is always `[]` in phase 2, because claims arrive in a later phase.
- `GET /api/agents/planner/latest` returns `{ latest: null }` before the first completed run. Otherwise `latest.run` is that run, and `latest.changedSince` counts the tasks changed after its `finishedAt`.

## Status updater

- `statusUpdaterInputSchema` is a union on `scope`. `task` covers one task with its subtasks and notes. `since` covers the tasks that changed in the window, at most `AGENT_LIMITS.maxStatusUpdateTasks`.
- Without `since`, the window starts `AGENT_LIMITS.statusUpdateDefaultWindowMs` (24 hours) before the run starts.
- `tone` overrides the tone the model picks. `notes` are saved as task notes before the run starts, which is how the UI answers `ask_for_notes`.
- The model ends with `submit_status_update` or `ask_for_notes`.
- `StatusUpdaterOutput` is a union on `kind`. With `update`, code has checked every task id, moved each `done` item whose task is not done to `inProgress` with a warning, added `identifier` to every item, and built `text` as Slack mrkdwn. With `needs_notes`, the UI asks for one note per task in `taskIds`.
