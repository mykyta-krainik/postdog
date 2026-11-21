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

## Errors

| Code                         | Status | Returned when                                                                                                                           |
| ---------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `validation_error`           | 400    | A body, query or param fails its schema, or an id in the body breaks a rule: an unknown task, a subtask of a subtask, a link to itself. |
| `not_found`                  | 404    | The `:id` in the path does not exist.                                                                                                   |
| `conflict`                   | 409    | The new link already exists.                                                                                                            |
| `stale`                      | 409    | `baseUpdatedAt` differs from the target task's `updatedAt`.                                                                             |
| `ai_disabled`                | 403    | An agent or suggestion route is called while `aiEnabled` is false.                                                                      |
| `agent_failed`, `step_limit` |        | Agent run failures. Phase 2 stores them on the run.                                                                                     |
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
