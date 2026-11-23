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

## Endpoints in phase 3

Every route under `/api/agents` and `/api/suggestions` answers `403 ai_disabled` while `aiEnabled` is false.

| Method and path                       | Request                            | Success                                               |
| ------------------------------------- | ---------------------------------- | ----------------------------------------------------- |
| `POST /api/agents/decomposer/run`     | body `decomposerRunInputSchema`    | 202 `startRunResponseSchema`                          |
| `POST /api/agents/decomposer/clarify` | body `clarifyInputSchema`          | 202 `startRunResponseSchema`                          |
| `GET /api/suggestions`                | query `listSuggestionsQuerySchema` | 200 `listSuggestionsResponseSchema`, oldest first     |
| `POST /api/suggestions/:id/accept`    | body `acceptSuggestionInputSchema` | 200 `acceptSuggestionResponseSchema`                  |
| `POST /api/suggestions/:id/reject`    |                                    | 200 `rejectSuggestionResponseSchema` (the suggestion) |

`GET /api/tasks/:id` also returns `pendingSuggestions` (see Suggestions).

## Errors

| Code                         | Status | Returned when                                                                                                                           |
| ---------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `validation_error`           | 400    | A body, query or param fails its schema, or an id in the body breaks a rule: an unknown task, a subtask of a subtask, a link to itself. |
| `not_found`                  | 404    | The `:id` in the path does not exist.                                                                                                   |
| `conflict`                   | 409    | The new link already exists, the run to cancel is not running, or the suggestion to accept or reject is no longer `pending`.            |
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
- `error` is `null` unless `status` is `failed` or `cancelled`. Its `code` comes from `AGENT_ERROR_CODES`, not `ERROR_CODES`. `internal_error` means the agent code itself crashed, not the model or a limit.
- `trace` holds one `TraceStep` per step, 1-based. `input` is a truncated string, and `tokens` is set on `llm` steps only.
- `llm` records the model layer the run used. `GET /api/agents/info` returns the one in use now, for the "Mock AI" badge.
- `input` and `output` are `unknown` on `agentRunSchema`. To read them, parse the run with `plannerRunSchema`, `statusUpdaterRunSchema` or `decomposerRunSchema`, picked by `agent`.
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
| `report_related`       | `reportRelatedInputSchema`      | terminal |
| `propose_subtasks`     | `proposeSubtasksInputSchema`    | terminal |
| `ask_clarification`    | `askClarificationInputSchema`   | terminal |
| `skip`                 | `skipInputSchema`               | terminal |

The Planner uses `get_task` and `search_tasks`. The Status updater uses all three read tools. The Decomposer ends its related-task pass with `report_related` and each per-task loop with `propose_subtasks`, `ask_clarification` or `skip`. `proposeSubtasksInputSchema` is `subtasksPayloadSchema` and `askClarificationInputSchema` is `clarificationPayloadSchema`, and each `report_related` group is a `relatedPayloadSchema`, so the model's output and the stored payload share one schema.

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
- `StatusUpdaterOutput` is a union on `kind`. With `update`, code has checked every task id, moved each `done` item whose task is not done to `inProgress` with a warning, added `identifier` to every item, and built `text` as Slack mrkdwn. With `needs_notes`, `tasks` lists `{ taskId, identifier, title }` for each task that needs a note, so the UI can ask for one note per task without extra fetches.

## Suggestions

A suggestion is one `agent_suggestions` row. The Decomposer saves one for every outcome the user reviews. `Suggestion` is a union on `kind`, so `payload` is typed by it.

| `kind`          | `payload` schema             | Shape                                                                         |
| --------------- | ---------------------------- | ----------------------------------------------------------------------------- |
| `subtasks`      | `subtasksPayloadSchema`      | `{ subtasks: [{ title, description, priority? }] (2 to 8), rationale }`       |
| `clarification` | `clarificationPayloadSchema` | `{ questions: string[] (1 to 3), whatIsUnclear }`                             |
| `related`       | `relatedPayloadSchema`       | `{ relation: duplicates or overlaps, taskIds (2 or more, distinct), reason }` |

- `mark_stale` is in `SUGGESTION_KINDS` for the database column only. It belongs to the Docs reviewer in phase 6, and `suggestionSchema` rejects it until then.
- `targetType` is always `task` in phase 3. A related suggestion is one row per group. Its `targetId` is the lowest id in `payload.taskIds`, and `payload.taskIds` lists every task in the group, the target included.
- A suggestion affects its target task and, when it is `related`, every task in `payload.taskIds`. `TaskDetail.pendingSuggestions`, the `targetId` filter of `GET /api/suggestions` and `aiState` all use this rule.
- `status` starts at `pending` and moves once to `rejected`, `applied` or `superseded`, which sets `resolvedAt`. Auto mode saves what it applied directly as `applied`, with `resolvedAt` equal to `createdAt`. A rollback moves an `applied` suggestion to `rolled_back`.
- `createdAt` orders suggestions. Lists are oldest first.
- A proposed subtask without `priority` is created as `medium`.

`suggestionPayloadSchemas` maps each kind to its schema. `parseSuggestionPayload(kind, payload)` returns Zod's `safeParse` result for that kind's schema, and its issue paths are relative to the payload, such as `subtasks.0.title`. The accept endpoint parses the user's edited payload this way and reports a failure as `400 validation_error` with paths prefixed by `payload.`. Without `payload`, it applies the stored one.

`baseUpdatedAt` on accept is the target task's `updatedAt` when the user loaded the suggestion.

## aiState

`aiState` on a task is derived from the claims and the pending suggestions that affect it. The first rule that matches wins.

1. `processing`: an agent run holds an unexpired claim on the task.
2. `clarification_pending`: a pending `clarification` suggestion affects the task.
3. `suggestion_pending`: any other pending suggestion affects the task.
4. `none`: nothing else matches.

Rejected, applied and superseded suggestions do not count. Changing `aiState` never changes `updatedAt`.

## Decomposer

- `decomposerRunInputSchema`: without `taskIds`, the server picks up to `AGENT_LIMITS.maxDecomposerTasksPerRun` eligible tasks. With `taskIds`, it works on those, 1 to 10 distinct ids.
- `clarifyInputSchema` takes `suggestionId` and exactly one of `answers` or `generateAnyway: true`. `answers` re-runs the task with the questions and answers added. `generateAnyway` re-runs it with an instruction not to ask, to assume what it must and to list those assumptions.
- `listSuggestionsQuerySchema` defaults `status` to `pending`. With `targetId`, a related suggestion matches every task in its group.
- `DecomposerOutput` is the run's stored output. `tasks` has one row per task the run looked at, with an `outcome` from `DECOMPOSER_OUTCOMES`, the saved `suggestionId` or `null`, and a `detail` line for the UI, such as "Skipped PD-12: being processed by decomposer run #41". `related` lists the related suggestions it saved. `counts` has one count per outcome, plus `considered`. `warnings` lists dropped items, as on every agent.
- `AGENT_LIMITS` holds `decomposerConcurrency` (3 task loops at once), `claimTtlMs` (2 minutes), `rejectedCooldownMs` (7 days) and `maxSubtasks` (8).
- Auto mode adds the outcome `applied_subtasks`: the subtasks were created, recorded in the run's changeset, and the `subtasks` suggestion was saved as `applied`. `changesetId` is that changeset, or `null` when the run created nothing. `counts.appliedSubtasks` counts the tasks with that outcome, `counts.createdSubtasks` the subtasks created across them, and `counts.appliedLinks` the `relates` links created. A `related` entry has `applied: true` when auto mode linked the group.
- An output stored before auto mode still parses: `changesetId` defaults to `null`, the three new counts to `0` and `applied` to `false`.

## Changesets and notifications

A changeset records what one auto-mode Decomposer run created, so the user can undo it from the Inbox. A notification is one Inbox entry.

- `Changeset` is one `agent_changesets` row. Each `ChangesetOp` has a `type` (`create_task` or `create_link`), the `id` of the created task or link, the `taskId` it belongs to and a `state`. For a subtask, `taskId` is its parent. For a link, it is the lowest task id of the related group, the same task the group's suggestion targets. Rolling back one task's part acts on the ops with that `taskId`.
- An op's `state` starts at `applied`. A rollback moves it to `rolled_back` when it deleted the item, or to `kept` when it left the item in place. `ROLLBACK_KEPT_REASONS` says why: `edited`, `has_children`, `has_notes`, `has_links` (a link the run did not make), `status_changed`, or `not_found` when the item was already gone.
- `changesetStatusOf(ops)` gives the changeset's `status`: `applied` while every op is applied, `rolled_back` once every op is rolled back, `partially_rolled_back` otherwise. The status is always derived from the ops, never set on its own.
- `ChangesetSummary` is the read model the Inbox renders without extra calls. `tasks` has one entry per `taskId`, lowest id first, with the task's `identifier` and `title` (both `null` when the task was deleted), the number of `createdSubtasks` and `createdLinks` among its ops, and a `state`. `counts` totals the created subtasks and links of the whole changeset, whatever their state now.
- `changesetTaskStateOf(ops)` derives a task's `state` from its ops. The first rule that matches wins.
  1. `applied`: every op is still applied.
  2. `rolled_back`: every op was rolled back.
  3. `kept`: no op was rolled back, so the rollback deleted nothing of this task.
  4. `partially_rolled_back`: some ops were rolled back and some were not.
- `rollbackInputSchema` is the body of `POST /api/changesets/:id/rollback`. Without `taskId` it rolls back the whole changeset. With `taskId` it rolls back that task's part.
- `RollbackResponse` holds the updated summary, the number of tasks and links `deleted`, one `kept` item per op the rollback left in place, and `message`, a sentence ready for a toast, such as "Removed 5 subtasks and 1 link. 2 subtasks were edited and kept." A kept item's `identifier` and `title` name the subtask for `create_task`, or the task the op belongs to for `create_link`, and are `null` when that task is gone.
- `Notification` has a `kind` from `NOTIFICATION_KINDS`, a `title` and a `body`. `runId` and `changesetId` are `null` when there is none. `changeset` embeds the `ChangesetSummary` of `changesetId`, so an `auto_decomposition` entry can list its tasks and offer Rollback. `readAt` is `null` until the user reads it.
- `listNotificationsQuerySchema` takes `unread` (`"true"` or `"false"`, default `false`, which lists every notification) and `limit` (1 to 100, default 50). `ListNotificationsResponse` is `{ items, unreadCount }`, newest first, and `unreadCount` counts every unread notification, not only the listed ones. Marking a notification read answers `markNotificationReadResponseSchema`, the notification itself.
