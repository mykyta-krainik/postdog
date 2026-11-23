# Agents

How the agent platform works, for whoever writes an agent on it. The code has no comments, so the explanations live here.

## Layout

| Path                      | What it holds                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| `core/runAgent.ts`        | The tool-use loop: `runAgent(params)`.                                                      |
| `core/tool.ts`            | Tool types, `defineReadTool`, `defineTerminalTool`.                                         |
| `core/definition.ts`      | `AgentDefinition`, `AgentContext`, `defineAgent`.                                           |
| `core/llm.ts`             | The model layer (`Llm`), the mock model and `registerMockScript`.                           |
| `core/trace.ts`           | `TraceRecorder`: the in-app trace saved on the run.                                         |
| `core/tracer.ts`          | `Tracer` and `RunTracer`: Langfuse, or a no-op without keys.                                |
| `core/errors.ts`          | `AgentError(code, message)` fails a run. `ToolError(message)` becomes an error tool result. |
| `tools/read.ts`           | `createReadTools(db, now?)`: `getTask`, `searchTasks`, `getTaskNotes`.                      |
| `tools/userText.ts`       | `wrapTask` and `tagUserText`: user text in `<task>` or `<note>` tags, brackets escaped.     |
| `context.ts`              | `computeTaskFacts` and `loadTaskFacts(db, now)`: per-task numbers computed in code.         |
| `registry.ts`             | The definitions the routes run.                                                             |
| `planner/index.ts`        | `plannerAgent`, the daily Planner (see `planner/README.md`).                                |
| `status-updater/index.ts` | `statusUpdaterAgent`, the Slack status updater.                                             |
| `decomposer/index.ts`     | `decomposerAgent` and `decomposerClarifyAgent`, both modes (see `decomposer/README.md`).    |

Run storage and the HTTP routes live in `services/agentRuns.ts`, `controllers/agents.ts` and `routes/agents.ts`.

## Define an agent

An agent is an `AgentDefinition`:

- `name`: an `AgentName` from `@postdog/shared`, stored on the run.
- `promptVersion`: the prompt constant's name, such as `PLANNER_PROMPT_V1`, stored on the run.
- `input`: the Zod schema of the request body. The route validates the body with it.
- `output`: the Zod schema of the stored output. The run service parses what `run` returns with it, so a run never stores an output the contract rejects.
- `prepare(db, input, startedAt)`, optional: runs synchronously before the run row exists and returns the input the run stores and receives, such as the input with a default resolved from `startedAt`. Throw an `AppError` from `lib/errors` (such as `invalidField("taskId", "Task 9 does not exist")`) to answer 400 instead of starting a run. Saving `notes` before a Status updater run fits here too.
- `mode(db)`, optional: the decomposition mode the run applies (`suggest` or `auto`). The run service stores it on the run row and passes it as `ctx.mode`. Without it, both are `null`.
- `run(ctx, input)`: does the work and returns `{ output }`.

`ctx` is an `AgentContext`:

- `runId`, `startedAt`: the run row's id and start time. Use `startedAt` as "now" for day counts and windows.
- `mode`: what `definition.mode(db)` returned when the run started, or `null`.
- `db`: the database. Call repository functions from `src/repositories` with it, or build read tools with `createReadTools(ctx.db)`.
- `signal`, `trace`, `llm`, `tracer`: what `runAgent` needs. `ctx` has the same field names, so `runAgent({ ...ctx, name, system, userMessage, tools })` passes them on.

Usage is not returned by `run`. The run service sums the tokens of every `llm` step in `ctx.trace`, so a failed run and an agent with several loops keep their usage too.

## The loop

`runAgent({ name, system, userMessage, tools, maxSteps?, maxOutputTokens?, wallClockMs?, onStep?, signal, trace, llm, tracer })` calls the model one step at a time.

- `name` names the loop. The mock model looks its script up by this name, and Langfuse names each generation after it. An agent with several loops can use names such as `decomposer:related`.
- A tool call with invalid input or an unknown tool name gets an error tool result that tells the model what to fix, and the loop goes on. The count is per step, because real models send several calls in one step: two steps in a row in which every call is invalid fail the run with `validation_failed` (`AGENT_LIMITS.maxConsecutiveValidationErrors`), and a step with one valid call starts the count again.
- Before validation, a top-level value that is a string starting with `[` or `{`, at a key whose JSON schema is an array or an object, is parsed as JSON (`parseStringifiedFields`). Claude sometimes sends `{"subtasks": "[{...}]"}`. A string that does not parse, or sits at a key that wants a string, is left alone. Arguments that are not JSON at all (the provider hands them over as a string, as OpenAI does for `{"id":`) get "Your arguments were not valid JSON; send a JSON object." and count as an invalid call.
- A read tool runs, and its return value goes back as a JSON tool result. `runAgent` passes it through `tagUserText` first, so for every agent each `title` and `description` field is wrapped in `<task>` tags and each `body` (a note) in `<note>` tags. `escapeTags` turns `<` and `>` into `&lt;` and `&gt;` inside them, and also the lookalike brackets `＜ ＞ ‹ › ⟨ ⟩ 〈 〉 ﹤ ﹥ ❮ ❯`, so user text cannot close a tag. `summarize` gets the untagged value, so traces show plain text. A `ToolError` it throws goes back as an error tool result. Any other error it throws fails the run with `internal_error`.
- Calling the same read tool with the same input twice in a row returns the first result again, with a note that the model already has it.
- The first valid terminal tool call ends the loop. `runAgent` resolves to `{ toolName, output, steps }`, where `output` is the terminal tool's parsed input. With several terminal tools, `toolName` narrows `output`.
- `onStep(step)`, optional, runs after every model call, before that step's tools run. The Decomposer renews its claims there.
- A reply with no tool call gets one nudge ("Finish by calling one of: ..."). A second one fails with `no_terminal_tool`.
- Limits fail with their code: `step_limit` after `maxSteps` model calls (default `AGENT_LIMITS.maxSteps`), `timeout` after `wallClockMs` per loop (default 60 s), `llm_error` when the model call throws. `maxOutputTokens` defaults to 4,096 per call. An answer the provider cut off at that limit (`finishReason: "length"`, Anthropic's `max_tokens`) fails the loop at once with `llm_error`, "The model's answer was cut off at 4096 tokens, the output limit of one step.", because the cut tool call or text cannot be trusted. Before this check, it surfaced as a misleading `no_terminal_tool` or `validation_failed`.
- An abort ends the loop with the abort reason when it is an `AgentError`, otherwise with `cancelled`. The user's cancel aborts with `cancelled` and the kill switch with `ai_disabled`.

Every failure is an `AgentError`. The trace so far stays in `ctx.trace` and is saved on the run.

## Define a tool

```ts
const getWidget = defineReadTool({
  name: "get_widget",
  description:
    'Get one widget by id. Use it when ... Do not use it to ...; use search_widgets for that. Example: {"id": 3}.',
  input: getWidgetInputSchema,
  run: ({ id }) => {
    const widget = findWidget(db, id);
    if (!widget)
      throw new ToolError(`Widget ${id} not found. Use search_widgets to find valid IDs.`);
    return { id: widget.id, name: widget.name };
  },
  summarize: (widget) => `Widget ${widget.name}`,
});

const submitAnswer = defineTerminalTool({
  name: "submit_answer",
  description: "Submit the final answer. Call it once, when you are done.",
  input: submitAnswerInputSchema,
});
```

- Input schemas live in `@postdog/shared`. Their `.describe()` texts reach the model as field descriptions.
- A description says what the tool does, when to use it, when not to, and gives an example. Keep it free of provider-specific features.
- A read tool returns small, flat JSON with only the fields the model needs, at most 50 items, and text cut at 1,500 characters with `truncated: true`.
- `summarize` is the tool step's `outputSummary` in the trace, which the UI shows. Without it, the summary is the output's JSON.
- Agents have no write tools. Code writes after the terminal tool, once it has checked the output.

## Validation and warnings

The terminal tool's Zod schema checks shape, lengths and enums inside the loop. Checks against the database (ids exist, task not done, not blocked) happen in the agent's `run` after the loop. Drop each failing item, add a warning to the output (`agentWarningSchema`), and record a `validation` trace step:

```ts
ctx.trace.record({
  type: "validation",
  input: item,
  outputSummary: "Dropped PD-3: it is done",
  durationMs: 0,
});
```

When nothing valid is left, throw `new AgentError("nothing_valid", "...")`.

## Mock scripts

In mock mode (`LLM_MOCK=true`, a missing provider key, and every test), the model replays a `MockScript` registered for the loop's `name`:

```ts
registerMockScript("planner", (conversation) => {
  if (conversation.turn === 1) return { toolCalls: [{ toolName: "get_task", input: { id: 3 } }] };
  return { toolCalls: [{ toolName: "submit_daily_plan", input: { focus: [/* ... */] } }] };
});
```

A script gets the conversation so far: `system`, `userMessage`, `turn` (1-based), every tool result so far in `results`, the newest ones in `lastResults` (`{ toolName, input, output, isError }`), and the raw `prompt`. It returns `{ toolCalls: [{ toolName, input }] }` or `{ text }`, or a promise of either. Register the script at the top level of the agent's module, so it is in place whenever the agent is imported. A missing script fails the run with `llm_error`.

## How a run is stored

1. `POST /api/agents/<agent>/run` validates the body with `definition.input`, calls `prepare`, inserts an `agent_runs` row with status `running`, starts `run` without awaiting it and answers 202 `{ runId }`.
2. Each `ctx.trace.record` saves the trace and usage on the row, so a client polling `GET /api/agents/runs/:id` sees progress.
3. When `run` resolves, the row gets `output`, `trace`, `usage`, `finishedAt` and status `completed`. When it throws, it gets `error: { code, message }` and status `failed`, or `cancelled` for `cancelled` and `ai_disabled`. An error that is not an `AgentError` is stored as `internal_error`.
4. Cancel and the kill switch write `cancelled` at once and abort the run. Only a row that is still `running` can be finished, so whichever outcome lands first wins.
5. When the run finishes or is cancelled, the run service releases every claim the run holds.
6. On API start, every row still `running` becomes `failed` with `interrupted`, the claims of every run that is no longer running are deleted, and `aiState` is recomputed for every task.

## Suggestions and claims

Agents coordinate through two tables: `agent_claims` (which run is working on a task) and `agent_suggestions` (what the user has to review). The functions below, in `src/repositories/claims.ts` and `src/repositories/suggestions.ts`, are the only writers. Each one recomputes `tasks.aiState` for the tasks it touches, so an orchestrator never sets `aiState` itself.

| Function                                                              | What it does                                                                                                                                                                                                                        |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tryClaim(ex, taskId, runId, agent, now)`                             | Claims the task until `now + AGENT_LIMITS.claimTtlMs`. Returns `{ claimed: true }`, or `{ claimed: false, heldBy: { runId, agent } }` when another run holds an unexpired claim on the task.                                        |
| `renewClaims(ex, runId, now)`                                         | Extends every claim the run holds. Call it after each loop step.                                                                                                                                                                    |
| `releaseTaskClaim(ex, taskId, runId, now)`                            | Releases one task's claim, and only when this run holds it.                                                                                                                                                                         |
| `releaseClaims(ex, runId, now)`                                       | Releases every claim of the run.                                                                                                                                                                                                    |
| `findActiveClaim(ex, taskId, now)`, `listActiveClaims(ex, now)`       | Unexpired claims.                                                                                                                                                                                                                   |
| `insertSuggestion(ex, row)`                                           | Saves a `NewSuggestion` as `pending`, or as `applied` with `resolvedAt = createdAt` when `row.status` is `applied`. It parses the row with `suggestionSchema` and throws, saving nothing, when the payload does not match its kind. |
| `findSuggestion(ex, id)`, `listSuggestions(ex, filter)`               | Read suggestions, oldest first. A task `targetId` also matches related suggestions that list the task.                                                                                                                              |
| `listPendingSuggestionsOfTask(ex, taskId)`                            | What task detail returns as `pendingSuggestions`.                                                                                                                                                                                   |
| `resolveSuggestion(ex, id, status, now)`                              | Moves a `pending` suggestion to `rejected`, `applied`, `superseded` or `rolled_back` and sets `resolvedAt`. Returns `undefined` when it is missing or no longer pending.                                                            |
| `applySuggestion(ex, id, payload, now)`                               | Moves a `pending` suggestion to `applied` and stores the payload the user accepted. Recomputes `aiState` for the tasks of the stored and of the accepted payload.                                                                   |
| `supersedeSuggestionsOfTasks(ex, taskIds, now)`                       | Supersedes every pending suggestion that affects the tasks. Deleting a task calls it for the task and its subtasks.                                                                                                                 |
| `markSuggestionsRolledBack(ex, { runId, targetIds, now })`            | Moves the run's `applied` suggestions whose `targetId` is in `targetIds` to `rolled_back` and returns them. That starts the cooldown below for every task they affect.                                                              |
| `listTaskIdsInCooldown(ex, now)`                                      | Tasks affected by a suggestion rejected or rolled back within `AGENT_LIMITS.rejectedCooldownMs`.                                                                                                                                    |
| `recomputeAiState(ex, taskIds, now)`, `recomputeAllAiStates(ex, now)` | In `src/repositories/aiState.ts`. The functions above call them.                                                                                                                                                                    |

- Each function takes an `Executor` and wraps its writes in its own transaction. Inside your transaction that becomes a savepoint, so the claim or suggestion and the `aiState` change commit or roll back together with your other writes.
- `now` is a parameter so that tests can move the clock. `insertSuggestion` uses `row.createdAt` as `now`.
- A claim expires when `expiresAt <= now`. Every read ignores an expired claim, and `tryClaim` replaces it. Claiming a task the run already holds renews it.
- The stored `aiState` changes only when something writes. An expired claim leaves `processing` on the task until the next write on that task or the next API start. Check eligibility with `findActiveClaim`, not with `aiState` alone.
- `resolveSuggestion` returning `undefined` is how a second accept or reject of the same suggestion is detected. Answer it with `409 conflict`.
- `get_task` returns `claimedBy: { runId, agent }` or `null`. `search_tasks` and the Planner's candidate table do not have `claimedBy` yet. The Planner sees a claimed task as `aiState: processing`.

The test fixtures in `test/suggestionFixtures.ts` (`createTestDb`, `addTask`, `addRun`, `subtasksFor`, `clarificationFor`, `relatedOf`, `aiStateOf`) build these rows for tests.

## Reviewing suggestions

`services/suggestions.ts` holds the rules behind `GET /api/suggestions`, `POST /api/suggestions/:id/accept` and `POST /api/suggestions/:id/reject`. Every route sits behind `aiEnabledGuard`. Accept and reject each run in one transaction, so a failure saves nothing.

Accept checks run in this order. The first one that fails decides the answer.

1. `404 not_found` when the suggestion does not exist. `409 conflict` when it is no longer `pending`.
2. `400 validation_error` for a `clarification`. The message points to `POST /api/agents/decomposer/clarify`, which answers it.
3. With `payload` in the body, the user's edit is parsed with `parseSuggestionPayload`. A failure is `400 validation_error`, with issue paths such as `payload.subtasks.0.title`. Without `payload`, the stored one is used. The accepted payload is stored on the row.
4. `409 conflict` when the target task is gone. `409 stale` when its `updatedAt` differs from `baseUpdatedAt`. For a related suggestion, only the target, the lowest id of the group, is compared.

Then each kind applies its own rules.

- `subtasks`: the target must be top-level and not done, or the answer is `409 conflict`. A subtask added after the suggestion's `createdAt` is also `409 conflict`, because the user started the split by hand. A proposed title that equals an existing subtask's title, or an earlier proposed title, is `400 validation_error` on that item. Titles are compared trimmed and case-insensitively. `insertSubtasks` from `services/tasks.ts` creates the subtasks as `todo`, `medium` when the item has no priority. `POST /api/tasks/:id/subtasks` uses the same function. The parent's `updatedAt` stays as it is. The suggestion becomes `applied`, and the task's other pending `subtasks` and `clarification` suggestions become `superseded`. Related suggestions that list the task stay pending, because links do not depend on subtasks.
- `related`: `duplicates` creates `duplicates` links from the newer task to the older one. The newer task has the larger `createdAt`, or the larger id on a tie. `overlaps` creates `relates` links from the target. A group of more than two tasks is linked as a star. The target, the lowest id, gets one link to every other task. A star needs N - 1 links where every pair would need N(N - 1)/2, and it shows the whole group on the target's detail page. A pair that already has a link of that type, in either direction, is skipped. `createdBy` is `agent:<runId>` of the run that made the suggestion. No task's `updatedAt` changes. An edited payload may change the relation and the reason and drop tasks, but it must keep the target and list only tasks of the group, or the answer is `400 validation_error` on `payload.taskIds`.
- `mark_stale` rows cannot exist yet, because `suggestionSchema` rejects the kind and `insertSuggestion` refuses them. The Docs reviewer adds the kind and its accept rule in phase 6.

Reject answers `404` or `409 conflict` like accept. Otherwise the suggestion becomes `rejected` with `resolvedAt`, and `aiState` is recomputed for every task it affects. `listTaskIdsInCooldown` reads the rejected row, so the Decomposer leaves those tasks alone for 7 days.

## Changesets and notifications

Auto mode records what it creates in `agent_changesets`, and the Inbox reads `notifications`. The shapes are in `packages/shared/src/changesets.ts` and `notifications.ts`, and the shared README says how a changeset's status and each task's state follow from the ops.

| Function                                                 | What it does                                                                                                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `insertChangeset(ex, { runId, ops, now })`               | Saves the run's changeset with every op `applied` and status `applied`. A run has at most one changeset, so a second insert for the same run throws.   |
| `appendChangesetOps(ex, { runId, ops, now })`            | Adds `applied` ops to the run's changeset, and creates the changeset on the first call. Call it in the transaction that creates the subtasks or links. |
| `findChangeset(ex, id)`, `findChangesetByRun(ex, runId)` | Read one changeset, or `undefined`.                                                                                                                    |
| `updateChangesetOps(ex, id, ops)`                        | Replaces the ops and stores `changesetStatusOf(ops)` as the status, so the two never disagree. Returns `undefined` when the changeset does not exist.  |
| `summarizeChangeset(ex, changeset)`                      | The `ChangesetSummary` read model, with each task's `identifier` and `title` read now. A deleted task keeps its entry, with both names `null`.         |
| `insertNotification(ex, row)`                            | Saves an unread notification. `body` defaults to `""`, and `runId` and `changesetId` to `null`.                                                        |
| `findNotification(ex, id)`                               | One notification, with its changeset summary embedded, or `undefined`.                                                                                 |
| `listNotifications(ex, { unread?, limit })`              | Newest first, the larger id first on a tie, with each changeset summary embedded. With `unread: true`, only notifications whose `readAt` is `null`.    |
| `countUnreadNotifications(ex)`                           | Every unread notification, whatever the list's `limit`.                                                                                                |
| `markNotificationRead(ex, id, now)`                      | Sets `readAt` once. A second call keeps the first time and returns the same notification. Returns `undefined` when the notification does not exist.    |

- A subtask op's `taskId` is its parent. A link op's `taskId` is the lowest task id of the related group, which is also the `targetId` of the group's suggestion. Rolling back one task's part acts on the ops with that `taskId`, and `markSuggestionsRolledBack` with `targetIds: [taskId]` reaches the same task's suggestions.
- `services/rollbackRules.ts` decides which created items a rollback may delete. `subtaskKeptReason(task, childCount, noteCount)` returns `null` for an untouched subtask: it exists, its status is `todo` and `statusChangedAt` is `createdAt`, `updatedAt` is `createdAt`, and it has no subtasks and no notes. Otherwise it returns the first reason that applies: `not_found`, `status_changed`, `edited`, `has_children` or `has_notes`. `linkKeptReason(link)` returns `not_found` when the link is gone, and `null` otherwise. `isUntouchedSubtask` and `isUntouchedLink` are the same checks as booleans.
- Adding a note does not change `updatedAt`, so `has_notes` is what keeps a subtask whose only change is a note. Deleting it would delete the note.
- Summaries are built when they are read, so a notification shows the changeset as it is now, after any rollback.
- Boot reconciles nothing for these tables. A changeset written before a crash still describes rows that exist, so a rollback still works on it.

### Notifications and rollback API

`services/notifications.ts` and `services/changesets.ts` hold the rules behind these routes. None of them sits behind `aiEnabledGuard`. The spec guards only `/api/agents` and `/api/suggestions`. The client hides the Inbox when AI is off, and an undo must keep working after the user turns AI off.

| Route                               | Body or query         | Answer                                                                                                                                        |
| ----------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/notifications`            | `?unread=&limit=`     | `{ items, unreadCount }`, newest first, each with its changeset summary. `unreadCount` counts every unread notification, whatever `limit` is. |
| `POST /api/notifications/:id/read`  | none                  | The notification with `readAt` set. A second call keeps the first `readAt`. `404 not_found` when it does not exist.                           |
| `POST /api/changesets/:id/rollback` | `{ taskId? }` or none | `RollbackResponse`: the changeset summary after the rollback, the `deleted` counts, the `kept` items and a ready-made `message`.              |

A rollback runs in one transaction, so a failure part way through deletes nothing and changes no state. It follows these rules.

1. `404 not_found` when the changeset does not exist. With `taskId`, `404 not_found` when no op of the changeset has that `taskId`.
2. Only ops in state `applied` count: all of them, or only those of `taskId`.
3. A `create_task` op deletes its subtask when `subtaskKeptReason` returns `null`, and the op becomes `rolled_back`. The subtask's notes go with it through the cascade. Any other reason except `not_found` keeps the subtask: the op becomes `kept` and the subtask is listed in `kept` with its identifier, its title and the reason. A subtask the user already deleted (`not_found`) is undone already, so the op becomes `rolled_back` and the subtask is not listed. Pending suggestions that affect a deleted subtask become `superseded`, as with any task delete.
4. A `create_link` op deletes its link and becomes `rolled_back`. A link the user already deleted counts as `rolled_back` too.
5. `updateChangesetOps` stores the new op states, so the status becomes `rolled_back` when every op is rolled back, and `partially_rolled_back` otherwise.
6. For every task with at least one op rolled back, `markSuggestionsRolledBack` moves the run's `applied` suggestions of that task to `rolled_back`, which starts the 7-day cooldown. A task whose ops were all kept keeps its suggestion `applied`. A link op's `taskId` is the target of the related group's suggestion, so the same call reaches it. The repository recomputes `aiState` for every task those suggestions affect.
7. No task's `updatedAt` changes, the parent's included.

`deleted` counts only what this call deleted, not items the user had already deleted. `rollbackMessage(deleted, kept)` builds `message`, such as "Removed 5 subtasks and 1 link. 2 subtasks were edited and kept." Zero counts are left out, and each kept reason gets its own sentence: "had their own subtasks", "had notes" or "were started or finished".

A rollback is idempotent. When no op in scope is still `applied`, such as on a second call, the answer is `200` with zero `deleted` counts, an empty `kept` list and the message "Nothing left to roll back.", and nothing is written. A request without a body rolls back the whole changeset, like `{}`.

## Langfuse

With `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` set, `createTracer` exports to Langfuse through `@langfuse/otel` (base URL `LANGFUSE_BASE_URL`, default Langfuse Cloud). Each run is one trace named after the agent, tagged with the LLM mode and the prompt version, with `runId` in its metadata. Each model call is a generation, and each tool call a tool observation with an error level when it failed. The trace id is stored on the run, and the tracer flushes when the run ends. Without the keys the tracer is a no-op. Agents never call the tracer themselves: `runAgent` and the run service do.
