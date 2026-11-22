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
| `tools/userText.ts`       | `wrapTask` and `tagUserText`: user text in `<task>` tags with `<` and `>` escaped.          |
| `context.ts`              | `computeTaskFacts` and `loadTaskFacts(db, now)`: per-task numbers computed in code.         |
| `registry.ts`             | The definitions the routes run.                                                             |
| `planner/index.ts`        | `plannerAgent`, the daily Planner (see `planner/README.md`).                                |
| `status-updater/index.ts` | `statusUpdaterAgent`, the Slack status updater.                                             |

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
- A tool call with invalid input or an unknown tool name gets an error tool result that tells the model what to fix, and the loop goes on. Two invalid calls in a row fail the run with `validation_failed`.
- A read tool runs, and its return value goes back as a JSON tool result. A `ToolError` it throws goes back as an error tool result. Any other error it throws fails the run with `internal_error`.
- Calling the same read tool with the same input twice in a row returns the first result again, with a note that the model already has it.
- The first valid terminal tool call ends the loop. `runAgent` resolves to `{ toolName, output, steps }`, where `output` is the terminal tool's parsed input. With several terminal tools, `toolName` narrows `output`.
- `onStep(step)`, optional, runs after every model call, before that step's tools run. The Decomposer renews its claims there.
- A reply with no tool call gets one nudge ("Finish by calling one of: ..."). A second one fails with `no_terminal_tool`.
- Limits fail with their code: `step_limit` after `maxSteps` model calls (default `AGENT_LIMITS.maxSteps`), `timeout` after `wallClockMs` per loop (default 60 s), `llm_error` when the model call throws. `maxOutputTokens` defaults to 2,048 per call.
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

| Function                                                              | What it does                                                                                                                                                                                 |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tryClaim(ex, taskId, runId, agent, now)`                             | Claims the task until `now + AGENT_LIMITS.claimTtlMs`. Returns `{ claimed: true }`, or `{ claimed: false, heldBy: { runId, agent } }` when another run holds an unexpired claim on the task. |
| `renewClaims(ex, runId, now)`                                         | Extends every claim the run holds. Call it after each loop step.                                                                                                                             |
| `releaseTaskClaim(ex, taskId, runId, now)`                            | Releases one task's claim, and only when this run holds it.                                                                                                                                  |
| `releaseClaims(ex, runId, now)`                                       | Releases every claim of the run.                                                                                                                                                             |
| `findActiveClaim(ex, taskId, now)`, `listActiveClaims(ex, now)`       | Unexpired claims.                                                                                                                                                                            |
| `insertSuggestion(ex, row)`                                           | Saves a `NewSuggestion` as `pending`. It parses the row with `suggestionSchema` and throws, saving nothing, when the payload does not match its kind.                                        |
| `findSuggestion(ex, id)`, `listSuggestions(ex, filter)`               | Read suggestions, oldest first. A task `targetId` also matches related suggestions that list the task.                                                                                       |
| `listPendingSuggestionsOfTask(ex, taskId)`                            | What task detail returns as `pendingSuggestions`.                                                                                                                                            |
| `resolveSuggestion(ex, id, status, now)`                              | Moves a `pending` suggestion to `rejected`, `applied`, `superseded` or `rolled_back` and sets `resolvedAt`. Returns `undefined` when it is missing or no longer pending.                     |
| `supersedeSuggestionsOfTasks(ex, taskIds, now)`                       | Supersedes every pending suggestion that affects the tasks. Deleting a task calls it for the task and its subtasks.                                                                          |
| `listTaskIdsInCooldown(ex, now)`                                      | Tasks affected by a suggestion rejected or rolled back within `AGENT_LIMITS.rejectedCooldownMs`.                                                                                             |
| `recomputeAiState(ex, taskIds, now)`, `recomputeAllAiStates(ex, now)` | In `src/repositories/aiState.ts`. The functions above call them.                                                                                                                             |

- Each function takes an `Executor` and wraps its writes in its own transaction. Inside your transaction that becomes a savepoint, so the claim or suggestion and the `aiState` change commit or roll back together with your other writes.
- `now` is a parameter so that tests can move the clock. `insertSuggestion` uses `row.createdAt` as `now`.
- A claim expires when `expiresAt <= now`. Every read ignores an expired claim, and `tryClaim` replaces it. Claiming a task the run already holds renews it.
- The stored `aiState` changes only when something writes. An expired claim leaves `processing` on the task until the next write on that task or the next API start. Check eligibility with `findActiveClaim`, not with `aiState` alone.
- `resolveSuggestion` returning `undefined` is how a second accept or reject of the same suggestion is detected. Answer it with `409 conflict`.
- `get_task` returns `claimedBy: { runId, agent }` or `null`. `search_tasks` and the Planner's candidate table do not have `claimedBy` yet. The Planner sees a claimed task as `aiState: processing`.

The test fixtures in `test/suggestionFixtures.ts` (`createTestDb`, `addTask`, `addRun`, `subtasksFor`, `clarificationFor`, `relatedOf`, `aiStateOf`) build these rows for tests.

## Langfuse

With `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` set, `createTracer` exports to Langfuse through `@langfuse/otel` (base URL `LANGFUSE_BASE_URL`, default Langfuse Cloud). Each run is one trace named after the agent, tagged with the LLM mode and the prompt version, with `runId` in its metadata. Each model call is a generation, and each tool call a tool observation with an error level when it failed. The trace id is stored on the run, and the tracer flushes when the run ends. Without the keys the tracer is a no-op. Agents never call the tracer themselves: `runAgent` and the run service do.
