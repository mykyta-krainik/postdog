Postdog — Product & Engineering Spec
20 Nov 2026 · @Mykyta Krainik
1. Overview
Postdog is a task tracker for engineering teams, styled between Linear and PostHog: dense and fast like Linear, with PostHog's friendlier, warmer accents. On top of a plain tracker sit AI agents that plan the day, decompose tasks and keep the team's docs fresh. It is our implementation of the "DevLog" test task. The README must say so in its first paragraph.
This spec is written for coding agents. Build only what is here; when something is unclear, follow Working rules for coding agents at the end and ask instead of guessing.
Goals
• A tracker that works well with AI turned off.
• Agents that are genuinely agentic (a tool-use loop, decisions, several steps), with validated structured output and a human in control of every change.
• Clear, defensible architecture: FSD on the frontend, layered Express on the backend.
• Runs locally with npm install && npm run dev and no external services required.
How the brief maps to this spec
Brief requirement
Where it is covered
Task CRUD (title, description, status, priority, createdAt)
Data model, Backend API
List with status filter, sort by priority or date
Frontend: Tasks page
Persistence + README explanation
SQLite via Drizzle; the README part is written by the author
At least 2 real agents (multi-step, not one call)
Planner (A), Decomposer (B), Status updater (C), Docs reviewer (D, own idea)
At least 1 agent on a real API; mocks documented
All agents use a real model through the Vercel AI SDK (Anthropic by default); LLM_MOCK=true for running without a key
.env.example, npm install && npm run dev
Environment section
UI scaffolded by a coding agent
All UI tasks in this spec
AGENT_LOG.md; README agent-design section
Written by the author from real notes; agents must not invent them
README "Decisions and trade-offs" written without AI
Off limits for agents (Working rules)
2. Scope and phases
The brief budgets 8–10 hours and says cutting a feature beats spreading quality thin, so work goes in phases. Each phase must leave the app runnable and the tests green. Do not start a phase until the previous one is done. Decision: build phases 1–4 only. Phases 5–7 stay in this spec as designs, and the README presents them as next steps. Until phase 5 exists, agents run without the docs tools (search_docs, get_doc) and pinned docs. The basic task claim (skip a task another run is processing) moves into phase 3, because the Decomposer needs it; the Planner's get_agent_activity tool and conflict notes stay in phase 5.
Phase
Contents
Status if time runs out
1. Core
Monorepo, DB + seed, task CRUD, list (filter, sort), task detail/editor, task notes, read-only links display, settings with AI kill switch, responsive shell
Required
2. Agent platform + Planner
Agent loop, tool registry, Zod validation, traces, Langfuse (optional), mock LLM, Planner agent + "Today" view, Status updater agent (C)
Required
3. Decomposer, suggest mode
Batch decomposition, per-task clarifications, related-task detection, suggestion review UI with orange dot
Required
4. Decomposer, auto mode
Auto-apply as a changeset, notifications inbox, rollback, mode switch in settings
Required
5. Docs + coordination
Docs CRUD + transcripts as text, search_docs for all agents, agent claims and conflict notes
Not built: README next steps
6. Docs reviewer
Stale-doc detection agent + review UI
Not built: README next steps
7. Polish
Task links UI (blocks / relates / duplicates), keyboard shortcuts, eval script
Not built: README next steps
Out of scope
• Audio transcription. "Transcripts" are pasted text or an uploaded .txt / .vtt file. Real speech-to-text would add a second paid API and file handling for little demo value.
• Auth, multiple users, real-time collaboration, deployment.
• Embeddings and vector search. Docs use SQLite FTS5 keyword search, which needs no extra service.
• Agents running in the background on a schedule. Every agent run is started by the user.
3. Tech stack and repository
The project is an npm-workspaces monorepo: a Next.js frontend, an Express backend, and a shared package of Zod schemas used by both. A single root npm run dev starts both apps.
Area
Choice
Language
TypeScript, strict: true everywhere
Runtime
Node.js 22 LTS or newer; .nvmrc + engines in the root package.json
Frontend
Next.js (App Router), Tailwind CSS, shadcn/ui, SWR, React Hook Form + @hookform/resolvers/zod, lucide-react icons
Backend
Express, Zod, Drizzle ORM, better-sqlite3, drizzle-kit for migrations
AI
Vercel AI SDK (ai) + provider packages such as @ai-sdk/anthropic and @ai-sdk/openai, our own agent loop on top of it (not ToolLoopAgent)
Observability
Langfuse JS SDK, enabled only when its keys are set
Tests
Vitest (both apps), Supertest (API)
Tooling
ESLint, Prettier, concurrently for the dev script
Use the latest stable versions at scaffolding time. Pin them in package.json and commit package-lock.json. Do not add libraries beyond this table without writing down why in the PR description.
Repository layout
postdog/
  apps/
    web/            Next.js app (FSD, see Frontend)
    api/            Express app (layered, see Backend)
      data/
        postdog.db  SQLite file, git-ignored, created and seeded on first start
      drizzle/      generated migrations
  packages/
    shared/         Zod schemas, enums, DTO types shared by web and api
  .env.example
  README.md
  AGENT_LOG.md
  SPEC.md           this document, exported
Scripts (root)
• npm run dev: runs the API on port 4000 and web on port 3000 together via concurrently. On every start the API creates the data directory if needed, runs pending migrations, seeds if the database has not been seeded yet, then listens and, only once it holds its port, reconciles interrupted agent runs (see Agent coordination). A start that cannot listen, such as a second npm run dev, exits without touching the runs of the API already serving. db:seed migrates and seeds only. On SIGINT or SIGTERM the API stops taking requests, fails its own runs in progress with interrupted, flushes Langfuse and closes the database, giving up after 5 seconds. A fresh clone needs no other setup.
• npm run db:migrate, npm run db:seed, npm run db:reset (delete, migrate, seed). The seed writes every timestamp relative to the moment it runs.
• npm test, npm run lint, npm run typecheck.
The web app calls the API through a Next.js rewrite (/api/* → http://localhost:4000/api/*), so the browser sees a single origin and no CORS setup is needed.
The SQLite file is not committed
apps/api/data/ is git-ignored (add it to .gitignore, including the -wal and -shm files). The database is built on the first start, so a clean clone gets a fresh, populated app with dates relative to that moment, and the Today view and the Status updater's 24-hour window have something to show.
• Seeding is controlled by a settings row, seededAt, not by whether the file exists. Migrations and the seed run in one transaction that writes seededAt last, so a crash cannot leave a half-seeded database. If seededAt is set, the seed never runs again, so a user who deletes all tasks does not get them back.
• db:reset deletes the file and rebuilds it, which gives a clean start with fresh dates. The README mentions it.
• Tests use a temporary or in-memory database through DATABASE_PATH and never touch the dev database.
• better-sqlite3 is a native module. It normally installs from prebuilt binaries, but on an unusual Node version npm install compiles from source. Pinning Node in .nvmrc and engines reduces that risk.
Seed data
The seed has about 25 tasks with a realistic engineering flavour: mixed statuses and priorities, createdAt spread over the last 30 days (all relative to seed time, with at least two tasks changed and noted in the last 24 hours), two or three tasks stuck in progress for more than a week, two vague tasks (to trigger clarifications), two near-duplicates (to trigger related-task detection) and a few parent tasks with subtasks. It also has 4 docs: team conventions, an architecture note, a meeting transcript, and one doc that contradicts the current tasks, so the Docs reviewer has something to find.
4. Data model
All tables live in one SQLite file and are defined with Drizzle in apps/api/src/db/schema.ts. Enums and row types are re-exported from packages/shared. Timestamps are stored as integers (ms since epoch); IDs are integer primary keys, and every task also gets a human-readable identifier.
tasks
  id               integer pk
  identifier       text unique        "PD-12", from a counter in settings
  title            text  1..200
  description      text  0..10000, markdown
  status           enum  todo | in_progress | done
  priority         enum  low | medium | high
  parentId         integer? -> tasks.id, on delete cascade
  aiState          enum  none | suggestion_pending | clarification_pending | processing
  createdAt, updatedAt, statusChangedAt  integer

task_notes
  id, taskId       -> tasks.id, cascade
  body             text  1..5000, markdown   progress and completion notes
  createdAt

task_links
  id, fromTaskId, toTaskId            -> tasks.id, cascade
  type             enum  blocks | relates | duplicates
  createdBy        text  "user" | "agent:<runId>"
  createdAt
  unique(fromTaskId, toTaskId, type)

docs
  id, title, content (markdown)
  source           enum  manual | transcript
  status           enum  active | stale
  staleReason      text?
  pinned           boolean            always given to agents as context
  createdAt, updatedAt, lastReviewedAt?
docs_fts           FTS5 virtual table over title + content (raw SQL migration + triggers)

agent_runs
  id, agent        enum  planner | decomposer | status_updater | docs_reviewer
  mode             enum  suggest | auto | null
  status           enum  running | completed | failed | cancelled
  input, output    json
  trace            json  array of steps (see Agent platform)
  error            text?
  langfuseTraceId  text?
  usage            json  input/output tokens
  startedAt, finishedAt

agent_suggestions
  id, runId -> agent_runs
  targetType       enum  task | doc
  targetId         integer
  kind             enum  subtasks | clarification | related | mark_stale
  payload          json  validated by the kind's Zod schema
  status           enum  pending | rejected | applied | rolled_back | superseded
  createdAt                           orders suggestions (oldest first)
  resolvedAt?

agent_changesets
  id, runId -> agent_runs, unique   one changeset per run
  ops              json  [{ type: create_task | create_link, id, taskId, state: applied | rolled_back | kept }]   taskId = the task the op belongs to (the parent for a subtask, the lowest task id of the group for a link), so one task's part can be rolled back; state = what a rollback did to the item (kept = left in place because the user changed it; an item the user already deleted counts as rolled_back, since it is already undone: phase 4 decision)
  status           enum  applied | rolled_back | partially_rolled_back   always derived from the ops' states
  createdAt

agent_claims
  taskId, runId, agent, expiresAt     primary key (taskId)

notifications
  id, kind         enum  auto_decomposition | agent_failed | conflict
  title, body, runId?, changesetId?
  readAt?, createdAt

settings           key/value: aiEnabled, decompositionMode, identifierCounter, seededAt
Rules
• statusChangedAt is updated only when status changes. The Planner uses it for "days in this status".
• Subtasks are ordinary tasks with parentId. Nesting is one level deep; the API rejects a subtask of a subtask.
• updatedAt changes only when the user changes task content or status. aiState changes, claims, and subtask or link creation never bump it, so an agent's own writes cannot look like a user edit.
• Link direction: blocks means fromTask blocks toTask. duplicates means fromTask (the newer) duplicates toTask (the older). relates is symmetric and stored once.
• STALE_IN_PROGRESS_DAYS = 5, defined in packages/shared and used by the Planner and the Status updater.
• aiState is denormalized for fast list rendering (the orange dot). It is updated in the same transaction as the suggestion or claim that causes it. A task can have several pending suggestions, so aiState is derived with this precedence: processing, then clarification_pending, then suggestion_pending, then none.
• Suggestion payload shapes live in packages/shared/agents/*.ts. The same Zod schema validates the agent's output and the user's edited version at confirm time.
• A suggestion affects its target task and, for a related suggestion, every task in payload.taskIds. aiState, the 7-day rule and a task's pending suggestions all use this. Deleting a task supersedes the pending suggestions that affect it or its subtasks.
5. Backend: layered Express
Each layer talks only to the layer below it: routes → controllers → services → repositories → DB. Agents are services: they call repositories through the tool layer and never touch Express objects.
apps/api/src/
  app.ts, server.ts          app factory (testable) + listener
  config/env.ts              Zod-validated env, fails fast on bad values
  db/                        client, schema, migrate, seed
  routes/                    URL -> controller, plus validation middleware
  controllers/               parse request, call service, map to HTTP response
  services/                  business rules, transactions
  repositories/              Drizzle queries only, no business rules
  agents/
    core/                    runAgent loop, LLM client (anthropic | mock), tool types, tracing, errors
    tools/                   tool definitions shared by agents (read tools)
    planner/  decomposer/  docs-reviewer/   prompt.ts, tools.ts, schema.ts, orchestrator.ts
  middleware/                validate(schema), errorHandler, aiEnabledGuard
  lib/                       errors, logger, time helpers
Conventions
• Request bodies, params and queries are validated with schemas from packages/shared. A failure returns 400 { error: { code: "validation_error", details } }.
• One error format everywhere: { error: { code, message, details? } }. Codes include not_found, conflict, stale, ai_disabled, agent_failed, step_limit.
• Multi-row writes run in one transaction. better-sqlite3 transactions are synchronous, so no await inside them.
• Optimistic concurrency: the accept endpoint takes baseUpdatedAt and returns 409 stale if the target changed in the meantime. Rollback has no baseUpdatedAt; the untouched-only rule (see Decomposer) protects edited items.
• Every route under /api/agents and /api/suggestions goes through aiEnabledGuard, which returns 403 ai_disabled when AI is off.
• Cross-site writes are refused. The API listens on 127.0.0.1 (API_HOST) and has no auth, so a page on another site is the threat. Every write under /api (any method but GET, HEAD and OPTIONS) must send Content-Type: application/json, which a browser sends cross-site only after a CORS preflight the API never grants; anything else is 415 unsupported_media_type, and the web client sends {} when it has no body. A write with Sec-Fetch-Site: cross-site is 403 forbidden.
Endpoints
Method + path
Purpose
GET /api/tasks?status=&sort=priority|createdAt&order=&parentId=&q=
List tasks (top-level by default) with subtask counts and aiState
POST /api/tasks
Create a task
GET /api/tasks/:id
Task with subtasks, links and pending suggestions
PATCH /api/tasks/:id
Update fields; maintains statusChangedAt
DELETE /api/tasks/:id
Delete (cascades to subtasks and links)
POST /api/tasks/:id/subtasks
Bulk-create subtasks in one transaction ({ subtasks, baseUpdatedAt })
GET/POST /api/tasks/:id/notes
Task notes (progress and completion notes)
POST /api/tasks/:id/links, DELETE /api/links/:id
Task links
GET/POST/PATCH/DELETE /api/docs[/:id], GET /api/docs/search?q=
Docs CRUD + FTS search
POST /api/agents/planner/run
Start a Planner run; returns { runId }. The plan and trace are on the run.
POST /api/agents/decomposer/run
{ taskIds? }; default = all eligible tasks; returns { runId }. The summary is on the run.
POST /api/agents/decomposer/clarify
{ suggestionId, answers }; re-runs that one task; returns { runId }
POST /api/agents/status-updater/run
{ taskId } or { since }, plus optional tone; returns { runId }. The draft update, warnings and trace are on the run.
POST /api/agents/docs-reviewer/run
Start a Docs reviewer run; returns { runId }
GET /api/agents/runs[/:id]
Run history and the full trace
GET /api/agents/info
The model layer in use ({ llm: { mode: real | mock, model } }), for the "Mock AI" badge
GET /api/agents/planner/latest
The latest completed Planner run and how many tasks changed since it finished, for the Today page
POST /api/agents/runs/:id/cancel
Cancel a running run (AbortController)
GET /api/suggestions?targetType=&targetId=&status=
Pending suggestions
POST /api/suggestions/:id/accept
{ payload?, baseUpdatedAt }; payload = the user's edited version, re-validated
POST /api/suggestions/:id/reject
Reject
POST /api/changesets/:id/rollback
{ taskId? } Undo an auto-applied changeset, or only one task's part of it (see Decomposer)
GET /api/notifications, POST /api/notifications/:id/read
Inbox. Each notification with a changeset embeds its summary (one entry per task with its name, created counts and rollback state), so the Inbox needs no extra calls
GET/PATCH /api/settings
Settings
Agent runs are asynchronous. A run endpoint creates the agent_runs row with status running, starts the work in the API process, and returns { runId } at once. The client polls GET /api/agents/runs/:id every second or two until the status is not running. The 60-second wall clock applies to each agent loop, not to an HTTP request, so a Decomposer batch can take several minutes. Cancel uses an in-memory map of runId to AbortController. Streaming progress over SSE is a phase-7 improvement; until then, the UI shows staged progress text from the polled trace.
6. Frontend: FSD, UI and layouts
The frontend follows Feature-Sliced Design. Next.js keeps routing in a root app/ folder whose route files only import from FSD pages. Per the current FSD Next.js guidance, the FSD layers app and pages are named _app and _pages inside src/ so they do not clash with Next's own folders, and there is no empty root pages/ folder.
apps/web/
  app/                    Next routes: layout.tsx, page.tsx files that re-export from src/_pages
  src/
    _app/                 providers (SWRConfig, theme, Toaster), global styles
    _pages/               tasks, task-detail, today, docs, doc-detail, inbox, settings
    widgets/              app-shell (sidebar, top bar), task-list, task-detail-panel, today-focus,
                          suggestion-review, agent-trace, notifications-inbox, docs-list
    features/             task-create, task-edit, task-delete, task-filter-sort, task-link,
                          plan-day, decompose-tasks, answer-clarification, review-suggestion,
                          rollback-changeset, add-task-note, write-status-update, doc-edit, review-docs, toggle-ai, set-decomposition-mode
    entities/             task, doc, agent-run, suggestion, notification, settings
                          (each: model/types, api/ SWR hooks + keys, ui/ dumb components)
    shared/
      ui/                 shadcn/ui components (generated into here)
      api/                fetcher, ApiError, SWR key factory
      lib/                formatting, dates, cn()
      config/             routes, constants
Rules
• Imports only go downward (_app → _pages → widgets → features → entities → shared). Slices on the same layer do not import each other. Enforce this with an ESLint rule (e.g. eslint-plugin-boundaries) or @feature-sliced/steiger.
• Each slice exposes a public index.ts. No deep imports.
• Server state lives only in SWR. Mutations call the API, then mutate() the affected keys. Optimistic updates are used for status and priority changes only.
• Forms use React Hook Form with zodResolver, using schemas from packages/shared.
• Client-only UI state (filters, selected task, panel open) lives in URL search params where it should survive a reload or a shared link, otherwise in local component state. No global store.
• aiEnabled from settings controls what renders: when off, every AI entry point is hidden, not just disabled.
Look and feel: Linear × PostHog
• From Linear: dense lists, a quiet dark theme by default (light theme available), Inter, 13–14 px body text, subtle 1 px borders, compact rows with an identifier, a status icon and a priority icon, a command-like feel.
• From PostHog: warm accents (amber/orange as the brand colour), a friendlier tone in empty states and microcopy, a bit more personality in illustrations and badges.
• Brand tokens live in Tailwind/shadcn CSS variables: one accent (amber), neutrals, and status colours. AI elements use the accent consistently: the orange dot, the "Suggested" badge, agent buttons.
• Use no logos, icons or other assets from Linear or PostHog. Postdog has its own simple wordmark.
Key screens
• Tasks: a list grouped by status (collapsible groups), filter by status, sort by priority or created date, search. Each row shows the identifier, title, priority, subtask progress, link icons and the orange dot when aiState is suggestion_pending or clarification_pending. Toolbar actions: New task, Plan my day, Decompose.
• Task detail: title and description editor, status and priority pickers, subtasks, links, a pending-suggestions panel (accept, edit, reject), a notes timeline with "Add note", a "Write status update" button, and the latest agent trace.
• Today: the Planner's latest plan with reasons, a staleness hint ("3 tasks changed since"), and Start or Dismiss on each item.
• Docs: a list with source and status badges; an editor (markdown with a preview toggle); "Import transcript" (paste or upload .txt / .vtt); Review docs.
• Inbox: notifications, with Rollback on auto-decomposition entries.
• Settings: AI on/off, decomposition mode (Suggest / Auto), theme.
Responsive layouts
Breakpoint
Navigation
Task detail
Mobile, < 768 px
Top bar + sheet menu (shadcn Sheet)
Full page
Tablet, 768–1023 px
Collapsible icon rail
Overlay sheet from the right
Desktop, ≥ 1024 px
Full sidebar
Split view: list + side panel
Touch targets are at least 40 px on mobile. List rows stay one line with truncation, and secondary metadata hides below md. Check every screen at 375, 768 and 1280 px before a phase is marked done.
UX states for every AI action
Idle → running (staged progress text, Cancel) → result, clarification needed, or error. On error, show what failed, a Retry button and the collapsible trace. AI content is marked "Suggested" until accepted. Writes need confirmation in suggest mode and offer Undo in auto mode (see Decomposer).
7. Agent platform
Every agent runs on one hand-written tool-use loop in agents/core/runAgent.ts. The model decides which tool to call next. Code runs the tools, validates everything, and decides what is written to the database. The Vercel AI SDK is only the model layer, so switching provider or model is configuration. Its built-in loop (ToolLoopAgent with stopWhen and prepareStep) was the alternative; we keep our own so terminal tools, validation, claims and traces stay explicit and easy to test.
The loop
runAgent({ name, system, userMessage, tools, maxSteps, signal, trace }): Promise<AgentResult>
1.  Call the AI SDK's generateText for one step with the system prompt, the messages and the tools. Tools are built from each tool's Zod schema without an execute function, so the model's tool calls come back to our loop instead of running inside the SDK.
2.  Each tool call's input is validated with that tool's Zod schema. Invalid input goes back as an error tool result with a readable message, and the loop continues.
3.  Read tools run and their output goes back as a tool result.
4.  A terminal tool call ends the loop. Its validated input is the agent's structured output.
5.  A reply with no tool call gets one nudge ("Finish by calling one of: …"); a second one fails the run with no_terminal_tool.
6.  Limits: maxSteps (default 8), a 60-second wall clock per loop, maxOutputTokens per call, and at most 2 consecutive validation errors. Hitting any of them fails the run with its code and the trace.
7.  If the same tool is called with identical input twice in a row, the duplicate gets a cached result plus a note telling the model it already has this data.
Never drop a tool call from the message history without its matching tool result; providers reject unmatched pairs.
Tools
• Defined as { name, description, input: ZodSchema, run?, terminal? }. Descriptions say what the tool does, when to use it, when not to, and give an example.
• Read tools return small, flat JSON: only the needed fields, limit ≤ 50, long text cut at 1,500 characters with truncated: true.
• Agents have no write tools. Writes happen in orchestrator code after validation, either as suggestions (suggest mode) or as changesets (auto mode).
• Errors are written for the model to act on: "Task 42 not found. Use search_tasks to find valid IDs."
Output validation (after the terminal tool)
1.  Zod schema (shape, lengths, enums, array sizes).
2.  Referential checks against the DB: IDs exist, statuses allow the suggestion (e.g. no recommending done tasks), no duplicate titles inside one proposal or against existing subtasks.
3.  Items that fail step 2 are dropped individually and reported in run.output.warnings; the UI shows them. The run fails only if nothing valid is left.
Context and safety
• User-written content (task descriptions, docs, transcripts) is wrapped in tags (<task>, <doc>) and the system prompt says it is data, not instructions. Since agents have no write or delete tools, a prompt injection in a task description can at worst produce a bad suggestion, which the user reviews.
• Context stays bounded by design: small tool payloads, pagination, the step limit and per-agent pre-filtering in code. No compaction or context editing is needed at these sizes. The README explains why.
• Prompts are versioned constants (PLANNER_PROMPT_V1, ...), and the version is stored on each run.
LLM client
The model layer is the Vercel AI SDK, so changing provider or model needs no code changes. A provider registry (createProviderRegistry) maps LLM_MODEL values such as anthropic:claude-sonnet-5-5 or openai:<model> to a model. There are two modes:
• real: the model from LLM_MODEL. Prompts and tool descriptions avoid provider-specific features. Tool-calling quality varies between models, so the README lists which models were actually tested.
• mock: the AI SDK's mock language model (from ai/test; check the exact name in the installed version) replays scripted tool calls per agent. It is used in tests, when LLM_MOCK=true, and when the chosen provider has no key. The UI shows a "Mock AI" badge so nobody mistakes mock output for real output.
Traces
Each step records { step, type: llm | tool | validation, tool?, input (truncated), outputSummary, durationMs, tokens? }. Traces are saved on the agent_runs row, returned by the API, and shown in the UI as a collapsible timeline ("Looked at PD-12 → searched docs for 'auth' → proposed 4 subtasks").
8. Agents
There are four agents. Each has a code orchestrator around one or more runAgent loops: code does the filtering, scoring and writing, and the model does the judgment.
8.1 Planner: "What should I start with today?"
The Planner is read-only. It recommends 1–5 tasks for today, each with a reason, and never changes data.
• Pre-computed in code: every task that is not done gets ageDays, daysInStatus, priority, status, subtask progress, the number of open tasks it blocks, whether it is blocked, aiState and whether another agent has claimed it. A simple score pre-ranks them, and the top 30 go into the first message as a compact table. The model never does date arithmetic.
• Read tools: get_task(id) (includes links and subtasks), search_tasks(query), search_docs(query), get_doc(id), get_agent_activity().
• Terminal tool: submit_daily_plan({ focus: [{ taskId, reason, signals[] }] (1–5), warnings: [{ taskId?, message }], coordinationNotes: string[] }).
• Decision rules in the prompt: finish stale in-progress work (in progress more than STALE_IN_PROGRESS_DAYS) before starting new work; prefer tasks that unblock others; weigh priority against age; skip blocked tasks; respect team conventions from pinned docs; mention tasks that are claimed or awaiting review instead of silently ignoring them.
• Validation: IDs exist, are not done and are not blocked by an open task. Failing items are dropped and become warnings.
• UI: the Today page shows the latest plan and how many tasks changed since it was generated, with a Refresh button.
8.2 Decomposer: splitting tasks into subtasks
The Decomposer works on a batch of tasks. One task needing clarification never blocks the others. It has two modes, set in Settings.
Eligible tasks (code): top-level, status todo, no subtasks, aiState = none, not claimed by another run, and no suggestion rejected or rolled back for it in the last 7 days. At most 10 per run, chosen by priority (high first), then oldest createdAt. The user can also pick tasks explicitly with taskIds.
Stage 1, related-task pass: one agent loop over the batch (titles + short summaries) with search_tasks. Terminal tool: report_related({ groups: [{ taskIds (≥2), relation: duplicates | overlaps, reason }] }). Tasks in a duplicates group are left out of stage 2 for this run, so the agent doesn't create the same subtasks twice.
Stage 2, one loop per task: concurrency 3, Promise.allSettled, so a failure in one task doesn't affect the others. Each loop claims its task for the duration of the run.
• Read tools: get_task, search_tasks, search_docs, get_doc.
• Terminal tools (it must choose exactly one):
    ◦ propose_subtasks({ subtasks: [{ title, description, priority? }] (2–8), rationale })
    ◦ ask_clarification({ questions: string[] (1–3), whatIsUnclear })
    ◦ skip({ reason: already_atomic | not_actionable, explanation })
• Prompt rule: if the task has no clear outcome or scope, ask; do not guess. Check docs for team conventions (e.g. "every feature task has a tests subtask").
Stage 3, apply (code), by mode:
Outcome
Suggest mode
Auto mode
Subtasks proposed
Suggestion saved; orange dot (suggestion_pending)
Subtasks created in one transaction, recorded in a changeset
Clarification needed
Suggestion saved; orange dot (clarification_pending)
Same as suggest mode: never auto-answered
Related: overlaps
Suggestion to link
relates link created (in the changeset)
Related: duplicates
Suggestion only
Suggestion only: merging is never automatic
Skipped
Recorded on the run, no dot
Same
Every outcome is a row in agent_suggestions in both modes. In auto mode, outcomes that are applied are written with status applied and grouped by the run's changeset. This is what the 7-day "do not propose again" rule reads. A related suggestion is one row per group: targetId is the lowest task id, payload lists every taskId, and aiState is set on every task in the group. Accepting a duplicates suggestion creates a duplicates link (newer to older). Accepting an overlaps suggestion creates a relates link. Answering a clarification marks that suggestion superseded, and the re-run saves a new suggestion.

After an auto run, one notification summarizes it, e.g. "Split 4 tasks into 13 subtasks, linked 2 related tasks, 2 tasks need your answers", with a per-task list and a Rollback button.
Hard limits in auto mode: it never edits, deletes or re-prioritizes existing tasks. It only creates subtasks and relates links.
Clarifications: answering a clarification calls POST /agents/decomposer/clarify, which re-runs stage 2 for that one task with the questions and answers added, then applies the result according to the current mode.
Rollback: rolling back a changeset (or a single task's part of it) deletes the subtasks and links it created, but only the ones still untouched (updatedAt == createdAt, status unchanged, no children of their own, no notes and no links the user made: neither bumps updatedAt, but deleting the subtask would delete them). Anything the user has since edited is kept and listed ("2 subtasks were edited and kept"); the changeset becomes partially_rolled_back. A rolled-back task isn't proposed again for 7 days.
8.3 Status updater: async updates in Slack style (C)
The Status updater drafts a short update the user pastes into Slack. It is read-only: it writes text and never changes tasks.
• Scopes: one task (with its subtasks and notes), or "my update since a date" across the tasks that changed in that window (default: last 24 hours, at most 15 tasks).
• Raw material: status, subtask progress and task notes, short progress or completion notes added from the task detail page (new task_notes table).
• Pre-computed in code: for each task, its status, subtasks done out of total, days in status, open blockers, notes since the start of the window, and whether it changed in the window.
• Read tools: get_task, get_task_notes(taskId, since), search_tasks, search_docs (e.g. a pinned "how we write updates" doc), get_doc.
• Terminal tools (it must choose exactly one):
    ◦ submit_status_update({ tone: celebrate | neutral | heads_up | blocked, toneReason, headline (≤120 chars), done: [{ taskId, text }], inProgress: [{ taskId, text }], blockers: [{ taskId, text, ask? }], next: string[] (0–3) })
    ◦ ask_for_notes({ taskIds, question }): used when there is too little to report (no notes and no status or subtask change in the window). It asks for a one-line note instead of inventing progress.
• Tone rules in the prompt: tone follows the facts. Anything blocked, or stuck in progress for more than STALE_IN_PROGRESS_DAYS (5), makes the tone heads_up or blocked, goes first and comes with a concrete ask. Mostly finished work gets a brief celebrate; everything else is neutral. Updates are 3–8 plain lines with no corporate filler and at most one emoji. The user can override the tone and regenerate.
• Validation (code): task IDs exist and are in scope. An item under done must belong to a task whose status is done; otherwise it moves to inProgress with a warning. Length limits apply to every field.
• Rendering: code builds the Slack-formatted text (mrkdwn) from the structured fields, with identifiers like PD-12, so counts and statuses come from the data, not from the model.
• UI: "Write status update" on the task detail page and "My update" in the Tasks toolbar. The result opens in an editable text area with a tone picker, Regenerate and Copy. If the agent called ask_for_notes, a note field appears for each task; saving the notes stores them as task notes and re-runs the agent.
• Wrong-result cases: the model calls an in-progress subtask "done", so validation moves it and shows a warning. With no recent activity it could make up progress; the ask_for_notes path exists to prevent that.
8.4 Docs reviewer (our own idea)
Why it helps: team docs rot quietly. A decision recorded in a call transcript gets reversed two weeks later, and the old doc keeps saying the opposite. Because every Postdog agent reads the docs, stale docs don't just mislead people: they mislead the agents too. The reviewer cross-checks docs against the current tasks and against each other, and proposes marking outdated material as stale, so both humans and agents work from current context.
• Pre-filter (code): active docs, oldest lastReviewedAt first, at most 8 per run.
• Read tools: list_docs, get_doc, search_docs, search_tasks, get_task.
• Terminal tool: submit_doc_review({ reviewedDocIds, findings: [{ docId, kind: outdated | contradicts_task | contradicts_doc | resolved_question, quote, reason, evidence: [{ type: task | doc, id }], action: mark_stale | flag_for_edit }] (0–10) }).
• Validation: quote must be an exact substring of the doc (this catches invented quotes), and evidence IDs must exist. A finding that fails is dropped with a warning.
• Suggest mode only: the user accepts a finding (the doc becomes stale with staleReason) or rejects it. lastReviewedAt is updated for every reviewed doc.
Known wrong-result cases (for the README)
• The Planner recommends a task that has just been completed in another tab. Validation drops it and the UI shows a warning.
• The Decomposer proposes subtasks that duplicate existing ones. The duplicate check drops them; if none are left, the outcome becomes skip.
• The Decomposer is too eager to ask questions about a clear task. The user can click "Generate anyway", which re-runs with a "don't ask, use reasonable assumptions and list them" instruction.
• The Docs reviewer quotes something that isn't in the doc. The exact-substring check rejects it.
9. Agent coordination
Agents don't message each other. They coordinate through a shared record in the database (a "blackboard"): claims, pending suggestions and recent runs. Every agent can read it, and code enforces it. This is simpler than agent-to-agent messaging, easy to audit, and it still works when agents run at the same time from different tabs.
Mechanism
• Claims: before an agent works on a task, the orchestrator writes an agent_claims row (taskId, runId, agent, expiresAt = now + 2 minutes, renewed after every loop step) and sets aiState = processing. Claims are released when the run ends, and expired claims are ignored, so a stalled run can't lock a task forever. When the API starts listening, every run still marked running is set to failed (error: interrupted), its claims are deleted, and aiState is recomputed from the pending suggestions, so a crash never leaves a task stuck in processing.
• Claim conflicts: if the task is already claimed, the claim fails and the orchestrator skips it, recording "Skipped PD-12: being processed by decomposer run #41".
• Read side: get_agent_activity() returns active claims, pending suggestions and runs from the last 24 hours. Task tools also include claimedBy and aiState on every task.
• Reporting conflicts: the Planner's prompt tells it to treat claimed or awaiting-review tasks as "in flux". It still may recommend them, but it must say so in coordinationNotes (e.g. "PD-12 is being decomposed; review its subtasks before starting"). The UI shows these notes above the plan.
• Stale writes: if the user edits a task while an agent is working on it, the apply step sees updatedAt > the run's start time. Suggest mode saves no suggestion and the run records the task as superseded (phase 3 decision); auto mode skips that task and adds a conflict notification.
  Implemented (phase 3): suggest mode does not save the suggestion at all; the run records the task's outcome as superseded with "PD-12 was edited while the Decomposer worked".
Examples
Situation
What happens
Planner runs while the Decomposer is splitting PD-12
Planner sees the claim and mentions it in coordinationNotes
Two Decomposer runs start at once
The second skips tasks the first has claimed and lists them in its summary
User edits PD-7 during an auto run
PD-7 is skipped; a conflict notification explains why
Docs reviewer marks a doc stale while the Planner is running
The Planner keeps the version it already read; the next run excludes the stale doc
10. Docs as agent context
Docs are the team's memory: notes written by hand and transcripts of calls. Every agent can search them, and a few pinned docs are always in context.
• Creating docs: a markdown editor, or "Import transcript" (paste text or upload .txt / .vtt; VTT timestamps are stripped, speaker names kept). The source is recorded as manual or transcript.
• Pinned docs: short, always-relevant docs such as team conventions or the definition of done. Their content goes into every agent's system prompt inside <pinned_docs>, capped at 4,000 characters in total; the UI warns when pinned docs exceed the cap.
• Retrieval for everything else: search_docs(query, limit ≤ 5) uses SQLite FTS5 (BM25 ranking) and returns { id, title, snippet, status, updatedAt }. get_doc(id) returns the content, cut at 6,000 characters with truncated: true. The agent decides when to look something up. This is one of its real decisions, and it shows in the trace.
• Stale docs: excluded from search_docs by default. With includeStale: true they come back marked status: "stale" with staleReason, so an agent can still explain historical context.
• Trust: doc content is user data inside <doc> tags and is never followed as instructions (see Agent platform).
• Why FTS5 and not embeddings: no extra service or API key, it runs inside the same SQLite file, and keyword search is good enough for a few dozen team docs. The README should name embeddings as the next step for larger doc sets.
11. Settings, AI kill switch and observability
Settings
Setting
Values
Default
aiEnabled
true / false
true
decompositionMode
suggest / auto
suggest
Theme
dark / light / system (stored in the browser, not the DB)
dark
Switching to Auto shows a confirmation that explains what Auto may do: create subtasks and relates links, nothing else, with every change undoable from the Inbox.
AI kill switch
Turning AI off is enforced in two places:
• Server: aiEnabledGuard returns 403 ai_disabled on every agent and suggestion route. Runs already in progress are cancelled.
• Client: every AI entry point (buttons, Today page, orange dots, suggestion panels, the Inbox's AI notifications) is hidden.
Existing suggestions stay in the database but are hidden; turning AI back on brings them back. The tracker works fully with AI off, and a test covers that.
Langfuse
Langfuse is optional. With LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY set, tracing is on; without them, the tracer is a no-op and nothing breaks.
• One Langfuse trace per agent run, named after the agent, with tags for mode and prompt version and runId in its metadata.
• One generation per LLM call (model, input, output, token usage), captured through Langfuse's AI SDK telemetry integration (check its current setup) or recorded manually, and one span per tool call (input, output summary, duration, error flag).
• The Langfuse trace ID is stored on agent_runs.langfuseTraceId. The run's trace panel links to it when a base URL is configured.
• Events are flushed when a run ends, including when it fails.
• Check the current Langfuse JS SDK docs for the exact package name and env variable names (the base URL variable changed between versions), and document them in .env.example.
The in-app trace (Agent platform) is always available. Langfuse adds cross-run debugging, latency and cost views on top of it.
12. Testing, environment and working rules
Tests (required per phase)
• Agent loop, with the mock LLM: happy path; invalid tool input followed by a correction; unknown tool; step limit; no terminal tool; cancellation.
• Validation: non-existent and done task IDs are dropped; duplicate subtasks are dropped; an invented doc quote is rejected; a status update cannot list an unfinished task as done.
• Decomposer: one task asks for clarification while the others still get proposals; duplicates are excluded from stage 2; rollback deletes untouched subtasks and keeps edited ones.
• Coordination: a claimed task is skipped; an expired claim is ignored.
• API: task CRUD; filter and sort; statusChangedAt behaviour; 403 ai_disabled on all AI routes; 409 stale on confirm.
• AI off: the tracker works end to end with aiEnabled = false and no API key.
• Fresh start: booting the API with a DATABASE_PATH that does not exist creates the directory and file, migrates and seeds; a second boot does not seed again; deleting every task and rebooting does not bring the seed back.
• Optional: npm run eval runs about 8 fixed scenarios against the real model and checks properties (e.g. "asked for clarification on the vague task", "did not recommend done tasks"), not exact text.
Environment (.env.example)
# LLM
ANTHROPIC_API_KEY=
OPENAI_API_KEY=               # only if an OpenAI model is used
LLM_MOCK=false                # true = scripted mock model (also used when the provider key is missing)
LLM_MODEL=anthropic:claude-sonnet-5-5   # provider:model from the AI SDK registry

# API
API_HOST=127.0.0.1            # loopback only; the API has no auth
API_PORT=4000
DATABASE_PATH=./apps/api/data/postdog.db

# Langfuse (optional; tracing is off when empty)
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
LANGFUSE_BASE_URL=            # confirm the variable name for the SDK version in use
Working rules for coding agents
1.  Work one phase at a time, in small commits with clear messages. A phase is done only when npm run typecheck, npm run lint and npm test pass, and npm install && npm run dev works from a clean clone.
2.  Follow the architecture: FSD import rules on the web app, layers on the API, shared Zod schemas as the single source of truth. Don't work around the lint rules.
3.  Don't invent features or change product behaviour. If the spec is unclear or contradicts itself, stop and ask, or list your assumption in the commit or PR description.
4.  Do not write or edit the README section "Decisions and trade-offs". Leave the placeholder <!-- Written by the author without AI. -->. Do not write AGENT_LOG.md. Do not write the README agent-design section either; leave the placeholder <!-- Written by the author from real notes. -->.
5.  At the end of each task, give the author a short summary: what you generated, what you were unsure about, and anything that should be checked by hand. The author uses this for AGENT_LOG.
6.  Never commit secrets. .env is git-ignored; only .env.example is committed.
7.  Prefer boring, readable code over clever abstractions. No new dependencies without a stated reason.
8.  UI work is checked at 375, 768 and 1280 px widths and in both themes.
Resolved questions
• Which LLM key will the reviewers use? Any AI SDK provider works; the default is Anthropic.
  Decided: Anthropic, the most likely reviewer key, stays the default.
• Is renaming "DevLog" to "Postdog" fine with the reviewers?
  Decided: yes, the product is called Postdog. The README's first paragraph says it implements the DevLog task.
• Should the README and UI be in English or Ukrainian?
  Decided: English for the README, AGENT_LOG, the UI and the seed data.
• Cut line: settled. Phases 1–4 are built (see Scope and phases).