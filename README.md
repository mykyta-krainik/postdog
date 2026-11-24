# Postdog

Postdog is a task tracker for engineering teams with AI agents on top. The tracker covers tasks, subtasks, notes and links, with a list you can filter, sort and search. Three agents work on the tasks: a Planner that picks what to start today, a Status updater that drafts a Slack update, and a Decomposer that splits tasks into subtasks. The tracker works fully with AI turned off.

**What is real and what is mock.** Every agent run during development used the scripted mock model. Langfuse tracing was checked only against a local fake receiver, not a real Langfuse server. The UI shows a **Mock AI** badge whenever the mock model is in use.

The product and engineering spec is [`postdog-spec.md`](postdog-spec.md).

## Quick start

You need:

- Node.js 22 or newer. `.nvmrc` holds `22`, and the root `package.json` has `"engines": { "node": ">=22" }`. Node 23 works but prints `EBADENGINE` warnings during install, because ESLint 10 and Vitest 5 ask for `^22.13` or `>=24`.
- npm, which comes with Node.

Install and start:

```sh
npm ci
npm run dev
```

`npm run dev` starts both apps with `concurrently`:

| App           | URL                     | Bound to    |
| ------------- | ----------------------- | ----------- |
| Web (Next.js) | `http://127.0.0.1:3000` | `127.0.0.1` |
| API (Express) | `http://127.0.0.1:4000` | `127.0.0.1` |

The web app calls the API through a Next.js rewrite (`/api/*` to the API port), so the browser sees one origin. `/` redirects to `/tasks`.

No other setup is needed. Without a `.env` file, the API runs on the mock model.

### The database

The SQLite file is not committed. `apps/api/data/` is git-ignored. On every start the API creates the data folder if needed, runs pending migrations and seeds the database if it was never seeded. The seed writes 27 tasks (20 top-level) with dates relative to the moment it runs, so a fresh clone gets a fresh, populated app.

Seeding is controlled by the `seededAt` row in the `settings` table, not by whether the file exists: once `seededAt` is set, the seed never runs again, so a user who deletes every task does not get the seed back.

Database scripts:

| Command              | What it does                                                    |
| -------------------- | --------------------------------------------------------------- |
| `npm run db:reset`   | Deletes the file, migrates and seeds. Gives fresh dates.        |
| `npm run db:migrate` | Runs pending migrations.                                        |
| `npm run db:seed`    | Migrates and seeds. Does nothing on a database that was seeded. |

Stop `npm run dev` before `npm run db:reset`. A running API keeps the deleted file open.

### Configuration

Copy `.env.example` to `.env` at the repo root. Real environment variables override the file. Keep comments on their own lines, because Node's `.env` parser can read an inline comment as the value.

| Variable              | Default                       | Meaning                                                                                                              |
| --------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`   | empty                         | Key for `anthropic:` models.                                                                                         |
| `OPENAI_API_KEY`      | empty                         | Key for `openai:` models.                                                                                            |
| `OPENROUTER_API_KEY`  | empty                         | Key for `openrouter:` models.                                                                                        |
| `LLM_MOCK`            | `false`                       | `true` forces the scripted mock model.                                                                               |
| `LLM_MODEL`           | `anthropic:claude-sonnet-5-5` | `provider:model`. Providers are `anthropic`, `openai` and `openrouter`.                                              |
| `API_HOST`            | `127.0.0.1`                   | The API has no auth. `0.0.0.0` exposes it to every machine that can reach yours.                                     |
| `API_PORT`            | `4000`                        | The API port. `apps/web/next.config.ts` reads the same root `.env`, so the proxy follows it.                         |
| `DATABASE_PATH`       | `./apps/api/data/postdog.db`  | A relative path resolves from the repo root.                                                                         |
| `LANGFUSE_PUBLIC_KEY` | empty                         | Tracing is on only when both Langfuse keys are set.                                                                  |
| `LANGFUSE_SECRET_KEY` | empty                         |                                                                                                                      |
| `LANGFUSE_BASE_URL`   | empty                         | Empty means `https://cloud.langfuse.com`. The v6 SDK (`@langfuse/otel`) reads this name; v2 used `LANGFUSE_BASEURL`. |

The API validates these at start with Zod (`apps/api/src/config/env.ts`) and exits on a bad value.

**When the mock model is used.** The API picks the mock model when `LLM_MOCK=true`, or when the key of the provider named in `LLM_MODEL` is empty. Otherwise it uses the real model. A missing key never fails the start. `GET /api/agents/info` reports `{ llm: { mode: "mock" | "real", model } }`, and the UI shows the **Mock AI** badge in mock mode. The mock is not a preview: in auto mode a mock Decomposer run writes its scripted subtasks into the real database.

To turn on a real model, set one key and a matching `LLM_MODEL`, then restart the API:

```sh
# .env
ANTHROPIC_API_KEY=sk-ant-...
LLM_MODEL=anthropic:claude-sonnet-5-5
LLM_MOCK=false

# or OpenRouter. The model id is everything after the first colon.
OPENROUTER_API_KEY=sk-or-...
LLM_MODEL=openrouter:anthropic/claude-sonnet-4.5
```

Pick a model that supports tool calling. Every agent run must end with a call to a terminal tool, and small or free models often fail that step. OpenRouter goes through the OpenAI provider's chat completions API (`.chat()`) at `https://openrouter.ai/api/v1`. Testing was conducted against Anthropic's Claude Sonnet 5.5.

**Other ports.** The web port is fixed at 3000 in `apps/web/package.json`. To run on other ports, start the two apps yourself:

```sh
API_PORT=6050 npm run dev -w @postdog/api
cd apps/web && API_PORT=6050 npx next dev --hostname 127.0.0.1 --port 6051
```

**Daily runs time zone.** The daily runs use the API machine's local time. Set `TZ` in the environment of the API process to use another zone, for example `TZ=Europe/Berlin npm run dev`.

## What you can do in the app

**Tasks** (`/tasks`). A list grouped by status (In progress, Todo, Done) with collapsible groups. Filter by status, sort by priority or created date, and search. Each row shows the identifier (`PD-12`), title, priority, subtask progress and the orange dot when a task has a suggestion or a question waiting. The toolbar has **New task**, **Plan my day**, **My update** and **Decompose**. Filters and the selected task live in the URL, so a reload or a shared link keeps them.

**Task detail** (`/tasks?task=12`). A side panel on desktop, a sheet on tablet and a full page on phones. Edit the title and description, pick status and priority, add subtasks, add notes, see links (read-only) and delete the task. The **Suggestions** panel lists pending agent suggestions with accept, edit and reject, and clarification questions with **Send answers** and **Generate anyway**. **Write status update** drafts an update for this task.

**Today** (`/today`). The Planner's latest plan: 1 to 5 tasks with a reason each, a hint such as "3 tasks changed since this plan", and **Start** or **Dismiss** on each item.

**Runs** (`/runs`). The last 30 agent runs with status, a one-line label, start time and duration. Open a run to watch it, cancel it, or read its result, error and trace. `/runs?run=12` opens one directly. Runs started by the daily schedule carry a **Scheduled** badge. The navigation shows a spinner and a count while runs are going.

**Inbox** (`/inbox`). Notifications with an unread badge in the navigation: auto-mode results with **Roll back** per task and **Roll back everything**, runs that finished while nobody watched them, failed or interrupted runs with their trace, and conflicts when you edited a task during an auto run.

**Settings** (`/settings`). The AI switch, **Daily runs**, the decomposition mode (Suggest or Auto, with a confirmation for Auto), and the theme (dark, light or system, stored in the browser).

### The agents

| Agent          | What it does                                                                                                                            | How to start it                                                                                                                        | What it writes                                                                                                                           |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Planner        | Picks 1 to 5 tasks to start today, each with a reason. Code ranks the open tasks and checks the picks.                                  | **Plan my day** (Tasks), **Refresh** (Today), `POST /api/agents/planner/run`, and daily at 08:00.                                      | Nothing. The plan is stored on the run.                                                                                                  |
| Status updater | Drafts a Slack update for one task or for everything that changed in the last 24 hours. Asks for notes when there is nothing to report. | **Write status update** (task detail), **My update** (Tasks), `POST /api/agents/status-updater/run`, and daily at 18:00 (since scope). | Nothing on tasks. Notes you type in answer to its question are saved as task notes.                                                      |
| Decomposer     | Finds related or duplicate tasks in a batch, then splits each task into 2 to 8 subtasks, asks up to 3 questions, or skips it.           | **Decompose** (Tasks), **Send answers** or **Generate anyway** on a question, `POST /api/agents/decomposer/run` and `/clarify`.        | Suggest mode: suggestions you review. Auto mode: subtasks and `relates` links, recorded in a changeset you can roll back from the Inbox. |

Decomposer details:

- **Suggest mode** (default). Every result is a suggestion. You accept it (optionally edited), or reject it. A rejected task is not proposed again for 7 days.
- **Auto mode.** Subtasks and `relates` links are created at once, in one transaction per task. Questions and possible duplicates still wait for you. Auto mode never edits, deletes or re-prioritizes an existing task.
- **Clarifications.** Answering re-runs the Decomposer for that one task with your answers. **Generate anyway** re-runs it with an instruction to assume and list its assumptions.
- **Rollback.** Rolling back a changeset, or one task's part of it, deletes only the subtasks and links still untouched. A subtask you edited, started, finished, gave notes, subtasks or your own links is kept and listed. A rolled-back task is not proposed again for 7 days.

How runs work:

- Agents run when you start them (the buttons or the run endpoints) and, for the Planner and the Status updater, on the daily schedule. Nothing else starts a run: not a page load, a task edit, or auto mode.
- A run executes in the API process, not in the browser. It keeps going when you leave the page or close the tab. You find it again on the Runs page. A run that ends while nobody watches it leaves an Inbox notification.
- One run per slot at a time: one Planner, one Decomposer batch, one clarification re-run per question, and one Status updater per scope. A second start answers `409 conflict`.
- **Daily runs.** With **Daily runs** on (the default), the API starts the Planner at 08:00 and the Status updater at 18:00, local time. A slot can start up to 6 hours late, after a restart or once AI or the setting is back on, and fires at most once a day. It skips quietly, with a log line and no run or notification, while AI or the setting is off, while a run of that agent is going, or when the agent has nothing to work on. The manual buttons work as before.
- **AI kill switch.** Turning AI off in Settings answers `403 ai_disabled` on every `/api/agents` and `/api/suggestions` route, cancels runs in progress, and hides every AI entry point in the UI. Existing suggestions stay in the database and come back when AI is on again. The Inbox rollback routes still work with AI off, so an undo is always possible.

## Architecture

```
postdog/
  apps/api/          Express + Drizzle + better-sqlite3 (layered)
  apps/web/          Next.js App Router (Feature-Sliced Design)
  packages/shared/   Zod schemas: the HTTP contract used by both apps
```

```
browser ──> Next.js (3000) ── rewrite /api/* ──> Express (4000) ──> SQLite file
                                                    │
                                                    └─> agent runs ──> AI SDK ──> mock model or provider
```

**Shared contract.** `packages/shared` holds every request and response shape as a Zod schema. The API validates requests with them, and the web app parses every response and builds its forms with them. The package has no build step: `exports` points at `src/index.ts`. See [`packages/shared/src/README.md`](packages/shared/src/README.md).

**API layers.** Each layer calls only the layer below it: `routes` (URL to controller, validation middleware), `controllers` (parse the request, map to HTTP), `services` (business rules and transactions), `repositories` (Drizzle queries only). Agents are services. Every error has one shape, `{ error: { code, message, details? } }`. The API listens on `127.0.0.1`. Every write must send `Content-Type: application/json` (otherwise `415`), and a write marked `Sec-Fetch-Site: cross-site` gets `403`.

**Web app.** Feature-Sliced Design inside `apps/web/src`: `_app`, `_pages`, `widgets`, `features`, `entities`, `shared`. The app and pages layers are named `_app` and `_pages`, following the FSD guide for Next.js, so they do not clash with Next's own `app/` folder. The root `app/` folder holds only route files that re-export pages. `eslint-plugin-boundaries` enforces the rules: imports go only downward, slices on one layer do not import each other, and every slice is imported through its `index.ts`. `apps/web/eslint.boundaries.test.ts` checks that the rule rejects bad imports. Server state lives only in SWR. Forms use React Hook Form with the shared schemas.

**Data model.** One SQLite file, defined in `apps/api/src/db/schema.ts`, with migrations in `apps/api/drizzle/`.

| Table               | Holds                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| `tasks`             | Title, description, status, priority, `parentId` (one level of subtasks), `aiState`, timestamps. |
| `task_notes`        | Progress and completion notes.                                                                   |
| `task_links`        | `blocks`, `relates` and `duplicates` links, with `createdBy` (`user` or `agent:<runId>`).        |
| `settings`          | Key and value: `aiEnabled`, `decompositionMode`, `scheduledRunsEnabled`, `seededAt` and others.  |
| `agent_runs`        | One row per run: agent, mode, trigger, status, input, output, trace, error, usage.               |
| `agent_suggestions` | What the user reviews: subtasks, clarifications and related groups.                              |
| `agent_claims`      | Which run is working on a task, with an expiry.                                                  |
| `agent_changesets`  | What one auto run created, op by op, so it can be rolled back.                                   |
| `notifications`     | Inbox entries.                                                                                   |

**Agent platform.** Every agent runs on one hand-written tool-use loop (`apps/api/src/agents/core/runAgent.ts`). The Vercel AI SDK is only the model layer: each step is one `generateText` call, and the tools are passed without an `execute` function, so the model's tool calls come back to the loop. The loop validates each call with the tool's Zod schema, runs read tools, and ends at the first valid terminal tool call. Agents have no write tools. After the loop, code checks the output against the database, drops invalid items with a warning, and decides what to write: nothing, suggestions (suggest mode) or a changeset (auto mode). Agents coordinate through the database: claims mark a task as being worked on, and pending suggestions and recent runs are visible to every run. Each run stores a trace that the UI shows as a timeline. Limits: 8 steps and 60 seconds per loop, and a failed run keeps its trace. User text reaches the model inside `<task>` and `<note>` tags with brackets escaped. Read [`apps/api/src/agents/README.md`](apps/api/src/agents/README.md) for the details, and the per-agent READMEs for the [Planner](apps/api/src/agents/planner/README.md) and the [Decomposer](apps/api/src/agents/decomposer/README.md).

## Tech stack

| Area          | Packages and versions                                                                                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language      | TypeScript 6.0.3, `strict` everywhere                                                                                                                                              |
| Runtime       | Node.js 22 or newer                                                                                                                                                                |
| Web           | Next.js 16.4.6, React 19.3.1, Tailwind CSS 4.3.5, shadcn/ui on `radix-ui` 1.8.1, SWR 2.5.1, React Hook Form 7.92.0, `@hookform/resolvers` 7.0.8, lucide-react 1.77.0, sonner 2.0.8 |
| API           | Express 5.3.0, Drizzle ORM 0.45.4, drizzle-kit 0.31.11, better-sqlite3 13.2.0, tsx 4.23.15                                                                                         |
| Contract      | Zod 4.6.7                                                                                                                                                                          |
| AI            | `ai` 7.0.179, `@ai-sdk/anthropic` 4.0.107, `@ai-sdk/openai` 4.0.122 (also used for OpenRouter)                                                                                     |
| Observability | `@langfuse/tracing` 6.1.1, `@langfuse/otel` 6.1.1, `@opentelemetry/sdk-trace-base` 2.12.0                                                                                          |
| Tests         | Vitest 5.1.1, Supertest 7.3.2                                                                                                                                                      |
| Tooling       | ESLint 10.15.0, typescript-eslint 8.73.0, eslint-plugin-boundaries 7.4.4, Prettier 3.10.1, concurrently 10.0.7                                                                     |

All versions are pinned exactly (`.npmrc` has `save-exact=true`), and `package-lock.json` is committed.

## Testing and quality

Run these from the repo root:

```sh
npm run typecheck
npm run lint
npm run format:check
npm run test
npm run build
```

On a fresh clone at `4d27247` (Node 23.11.0, npm 10.9.2), all five exit 0. `npm test` runs 778 tests:

| Workspace         | Test files | Tests |
| ----------------- | ---------- | ----- |
| `@postdog/api`    | 36         | 383   |
| `@postdog/web`    | 48         | 280   |
| `@postdog/shared` | 12         | 115   |

What the tests cover:

- **API, through HTTP.** Supertest against the real Express app and a temporary SQLite database. Agent runs use the scripted mock model, including scripts that send invalid input, unknown tools and no terminal tool. The spec's required cases are covered: the loop limits and cancellation, dropped invalid items, clarification and duplicate handling, rollback keeping edited subtasks, claims and expiry, `403 ai_disabled` on every AI route, `409 stale`, the tracker working end to end with AI off, and the fresh-start seed rules.
- **Wire format.** The real `@ai-sdk/anthropic` and `@ai-sdk/openai` providers with a fake `fetch`: parallel tool calls, cut-off answers, nested arrays sent as JSON strings, and the OpenRouter request.
- **Web.** Unit tests of the pure model code, and server-render tests (`renderToStaticMarkup`) that check what renders, including that AI entry points are hidden while AI is off. The FSD lint rule has its own test.
- **Mutation checks.** Workers broke the code on purpose many times to show the tests fail. A QA review killed 24 of 26 high-risk mutations. One survivor (a 500 that leaks the stack) later got a test. The other (a 413 mapped to 400) still has none.

A QA review measured coverage with `@vitest/coverage-v8` (not installed in the repo): API 94.2 % of lines, shared 100 %, web 46.3 %.

**Known gap.** The repo has no browser end-to-end tests and no web interaction tests. The web tests run in a `node` environment with no DOM.

## Known limits and next steps

**Not built.** Phases 5 to 7 of the spec are designs, not code:

- **Phase 5, docs and coordination.** Docs CRUD, transcripts as text, `search_docs` and `get_doc` for every agent (SQLite FTS5), pinned docs, the Planner's `get_agent_activity` tool and conflict notes. Embeddings would be the next step for larger doc sets.
- **Phase 6, Docs reviewer.** An agent that finds stale or contradicting docs and suggests marking them stale.
- **Phase 7, polish.** A UI to create task links, keyboard shortcuts, streaming run progress, and an eval script against a real model.

## Decisions and trade-offs

So, there have been made quite a lot of decisions and trade-offs in terms of how to implement agents, what to delegate to them and product features:
- don't use complex state management libraries like zustand or redux, because we have more server state than the real UI state
- use our own agent loop implementation instead of the Vercel AI SDK, because we need more control over the agent execution and the tool calling
- use a simpler way to trigger agent runs such as manual triggers or scheduled runs instead of triggers on data changes in the database
- not implement docs reviewer agent, because we don't have enough time and usage limits. But this would be helpful to give more context to the agents and improve the results.
- there are many frictions and unpolished parts in the code and UI, that aren't fixed because we don't have enough time and usage limits.
- use TDD as the main way to test the code, that adds a bit more overhead but still allows our agents to self-test and self-improve
- use pstack as the main way to work with agents and manage them. Adds more complexity and has higher token consumption, but allows agents to provide better results

## How the agents were designed

The agents design is quite simple, although specific agents implementations like decomposer have a lot of complexity and hidden details.

We have the base agent definition and its context to define explicitly what the agent is and what it does.

As I mentioned before, we use our own agent loop implementation instead of the Vercel AI SDK, because we need more control over the agent execution and the tool calling, although it adds more complexity.

And the loop itself works like this:

- we have a list of tools that the agent can use
- the agent can call tools and get the result
- the agent can call the model, pass the tools and the context and get the result
- no write tools are allowed, only read tools and terminal tools