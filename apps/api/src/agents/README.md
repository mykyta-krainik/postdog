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
| `context.ts`              | `computeTaskFacts` and `loadTaskFacts(db, now)`: per-task numbers computed in code.         |
| `registry.ts`             | The definitions the routes run.                                                             |
| `planner/index.ts`        | `plannerAgent`. A stub until the Planner replaces it.                                       |
| `status-updater/index.ts` | `statusUpdaterAgent`. A stub until the Status updater replaces it.                          |

Run storage and the HTTP routes live in `services/agentRuns.ts`, `controllers/agents.ts` and `routes/agents.ts`.

## Define an agent

An agent is an `AgentDefinition`:

- `name`: an `AgentName` from `@postdog/shared`, stored on the run.
- `promptVersion`: the prompt constant's name, such as `PLANNER_PROMPT_V1`, stored on the run.
- `input`: the Zod schema of the request body. The route validates the body with it.
- `output`: the Zod schema of the stored output. The run service parses what `run` returns with it, so a run never stores an output the contract rejects.
- `prepare(db, input, startedAt)`, optional: runs synchronously before the run row exists and returns the input the run stores and receives, such as the input with a default resolved from `startedAt`. Throw an `AppError` from `lib/errors` (such as `invalidField("taskId", "Task 9 does not exist")`) to answer 400 instead of starting a run. Saving `notes` before a Status updater run fits here too.
- `run(ctx, input)`: does the work and returns `{ output }`.

`ctx` is an `AgentContext`:

- `runId`, `startedAt`: the run row's id and start time. Use `startedAt` as "now" for day counts and windows.
- `db`: the database. Call repository functions from `src/repositories` with it, or build read tools with `createReadTools(ctx.db)`.
- `signal`, `trace`, `llm`, `tracer`: what `runAgent` needs. `ctx` has the same field names, so `runAgent({ ...ctx, name, system, userMessage, tools })` passes them on.

Usage is not returned by `run`. The run service sums the tokens of every `llm` step in `ctx.trace`, so a failed run and an agent with several loops keep their usage too.

## The loop

`runAgent({ name, system, userMessage, tools, maxSteps?, maxOutputTokens?, wallClockMs?, signal, trace, llm, tracer })` calls the model one step at a time.

- `name` names the loop. The mock model looks its script up by this name, and Langfuse names each generation after it. An agent with several loops can use names such as `decomposer:related`.
- A tool call with invalid input or an unknown tool name gets an error tool result that tells the model what to fix, and the loop goes on. Two invalid calls in a row fail the run with `validation_failed`.
- A read tool runs, and its return value goes back as a JSON tool result. A `ToolError` it throws goes back as an error tool result. Any other error it throws fails the run with `internal_error`.
- Calling the same read tool with the same input twice in a row returns the first result again, with a note that the model already has it.
- The first valid terminal tool call ends the loop. `runAgent` resolves to `{ toolName, output, steps }`, where `output` is the terminal tool's parsed input. With several terminal tools, `toolName` narrows `output`.
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
5. On API start, every row still `running` becomes `failed` with `interrupted`.

## Langfuse

With `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` set, `createTracer` exports to Langfuse through `@langfuse/otel` (base URL `LANGFUSE_BASE_URL`, default Langfuse Cloud). Each run is one trace named after the agent, tagged with the LLM mode and the prompt version, with `runId` in its metadata. Each model call is a generation, and each tool call a tool observation with an error level when it failed. The trace id is stored on the run, and the tracer flushes when the run ends. Without the keys the tracer is a no-op. Agents never call the tracer themselves: `runAgent` and the run service do.
