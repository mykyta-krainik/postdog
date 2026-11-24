# Agent notes

Raw notes compiled by an AI from the session record and worker reports. They are the input for AGENT_LOG.md, which the author writes. Facts, numbers and quotes come from the record; nothing here is the author's reasoning.

Sources: the session transcript (`f07a7456-19c5-4372-b116-c057492a9de6.jsonl`), the 28 worker hand-back reports in it, the orchestrator's messages to the user, `git log` on `main` at `4d27247`, and the spec. Times are UTC. "Orchestrator" is the Claude Code session that received `/pstack:poteto-mode`, planned the waves, spawned the workers and merged their branches. "Worker" is a subagent it spawned. Every worker was `pstack:poteto-agent`, and every worker after wave 0 ran in its own git worktree.

## Setup and spec review (21 Nov, 12:37 to 12:52)

- The author's first commit `8e04e3a` ("feat: setup a basic harness with poteto skills + the project spec") added the spec, `skills-lock.json`, `.claude/skills/` and `.claude/settings.json`.
- The orchestrator asked what to do with the spec. The author picked "Review the spec first" over "Build phase 1" and "Build phases 1–4".
- The orchestrator found 5 problems "that would make a coding agent build something broken" and 6 smaller gaps:
  1. A 60-second synchronous request cannot hold a Decomposer batch. Recommendation: async runs that return `{ runId }`, with the client polling.
  2. Claims expire (2 minutes) before long runs finish. Recommendation: renew after every loop step.
  3. `aiState = processing` can get stuck after a crash. Recommendation: reconcile on boot.
  4. The claim's own `aiState` write could trip the stale-write check. Recommendation: `aiState`, claims and subtask or link creation never bump `updatedAt`.
  5. The 7-day "don't re-propose" rule cannot see auto mode. Recommendation: write `applied` suggestion rows in auto mode too, and drop the `accepted` status.
  - Gaps included the single-enum `aiState`, no target for related suggestions, no end state for clarifications, rollback holes, a committed seed that ages badly, and rule 4 not covering the README agent-design section.
- Author: "I agree with your suggestions". The orchestrator edited the spec and picked minimal answers for the gaps (aiState precedence, one related row per group with the lowest id as target, newer-to-older duplicates links, superseded clarifications, per-task rollback with `{ taskId }`, `STALE_IN_PROGRESS_DAYS = 5`).
- The spec still committed the database. The author: "Hm, let's not commit our db in this case but make sure that when somebody starts the project freshly, they get a fressh working db too". The orchestrator changed the spec: the data folder is git-ignored, the database is built on first start, and a `seededAt` settings row (not the file's existence) controls seeding.
- The orchestrator made the spec edits uncommitted at first. `postdog-spec.md` has 17 commits in total on `main`, most of them agent edits that record decisions made during the build.
- The author then ran `/pstack:poteto-mode` with "we have the spec for our task dashboard with integrated ai agents, let's implement the first version of it". The orchestrator read that as phase 1 only.

## Phase 1, core (21 Nov, 12:52 to 15:30)

**Goal.** Monorepo, database and seed, task CRUD, list with filter and sort, task detail, notes, read-only links, settings with the AI kill switch, responsive shell.

**Workers.** 5 workers in 3 waves, all Opus:

| Wave | Worker                         | Effort | Parallel with |
| ---- | ------------------------------ | ------ | ------------- |
| 0    | Scaffold and shared contract   | xhigh  | alone         |
| 1a   | `apps/api` backend             | xhigh  | 1b            |
| 1b   | `apps/web` foundation and list | xhigh  | 1a            |
| 2a   | Task detail panel              | xhigh  | 2b            |
| 2b   | Settings page                  | high   | 2a            |

**What was generated.**

- Wave 0: npm workspaces, root tooling, `packages/shared` with enums, task, note, link, settings and error schemas, and the shared README. 35 tests.
- 1a: the layered Express API, `src/db/boot.ts` (open, migrate, seed once), `src/db/cli.ts` for the db scripts, the 27-task seed, `.env.example`. Added `internal_error` (500) to the shared error codes.
- 1b: Next.js with FSD layers, `eslint-plugin-boundaries` with a lint test, the responsive shell, the Tasks page with filters, sort, search and create.
- 2a: the task detail panel (editor, pickers, subtasks, notes, links, delete, loading and error states).
- 2b: the Settings page (AI switch, Suggest or Auto with confirmation, theme).

**Measured.**

- Wave 0: on a fresh clone `npm install`, typecheck, lint and test exit 0; 35 tests.
- 1a: 49 API tests. A mutation script broke 14 business rules; 13 made tests fail. The survivor was removing the `foreign_keys` pragma, which better-sqlite3 enables by default. A live script called every endpoint and parsed each response with the shared schemas: 45 checks passed. Restart did not reseed; deleting every task and rebooting kept the list empty.
- 1b: web 55 tests. Playwright on the system Chrome against a scratch fixture API: 30 scripted checks passed at 375, 768 and 1280 px.
- 2b: two deliberate breaks each failed 2 tests. Browser run: 32/32 flow checks, 13/13 width and theme checks, 7/7 touch-target checks.
- 2a: 162 tests in total (web 78). 23 end-to-end browser scenarios passed on the final run.
- End of phase 1 on merged `main`: 170 tests (API 49, web 86, shared 35). The orchestrator ran `npm ci` and `npm run dev` from a clean clone, saw the database created and seeded, and drove the app in a browser. It looked at the 1280 and 375 px dark screenshots only, not 768 or light.

**Differed from the spec or brief.**

- Wave 0: the repo already existed with the author's commit, so the worker did not re-init or rewrite history. TypeScript is 6.0.3, not 7.0.2, because typescript-eslint 8.73.0 needs `typescript <6.1.0`. Added typescript-eslint and `@eslint/js`, which the spec's stack table does not list. `PRIORITY_RANK` instead of `PRIORITY_ORDER`.
- 1a: a PATCH that repeats current values does not bump timestamps. JSON body limit raised to 1 MB. `db:seed` migrates first.
- 1b: FSD layers named `src/_app` and `src/_pages` (current FSD Next.js guide). `devIndicators: false`. `apps/web/AGENTS.md` committed because `next dev` rewrites it. Lint plugins instead of `eslint-config-next`.
- 2a: deleting a subtask selects its parent; an unsaved edit is saved on unmount; the Links section is hidden when empty.
- 2b: radio-group instead of toggle-group. The theme picker lives in `_pages/settings`, since the spec has no theme slice.

**Unsure about, and to check by hand (from the reports).**

- Wave 0: whether `.claude/settings.json` and `CLAUDE.md` should be tracked; a tighter `engines` range such as `"^22.13.0 || >=24"`.
- 1a: seed wording; root `npm run dev` untested on its branch; `db:reset` while the server runs leaves the server on the deleted file.
- 1b: integration with the real API; behaviour of a 500 with a code outside `ERROR_CODES`.
- 2a: `field-sizing: content` is unsupported in Firefox (only Chromium tested); `TaskRow` wraps identifiers from PD-100 up.
- 2b: the Auto dialog says undo is possible "from the Inbox", which did not exist until phase 4; amber icon contrast in light mode; arrow keys on the mode radios with a real keyboard.

**Bugs found.**

- 1b, by its own browser run: a status change crashed the panel, because SWR's matcher `mutate` gave one computed `optimisticData` to every matched key, so the list response landed in the detail cache. Fixed in `4579caa`. No unit test covers it.
- 2a, by its own browser run: a race in the add-subtask and note forms wiped or appended to the next title, and a fast double Enter added a subtask twice. The scenario failed 1 of 2 runs before the fix and passed 5 of 5 after. Also: lost edits on reload, no feedback on "Try again", scroll carried over between tasks.

**Human input.** At 15:20 the author wrote: "What's the fuck happening that this task takes you so long?". The orchestrator answered that the waves were sequential, each worker proved its work in a real browser at 3 widths and 2 themes ("the bulk of each 30–45 minute run"), and it re-checked between waves. It said less verification per worker "would have saved perhaps 30–40% of the time". From phase 2 on, workers got "lean" verification and the orchestrator did one integration pass per phase.

**Failures and recoveries.**

- npm 10.9.2 and 10.9.11 crashed on the first vitest install with "Cannot read properties of null (reading 'edgesOut')". Wave 0 generated the lockfile with `npx -y npm@11.21.3` and checked that npm 10.9.2 installs from it. Every later brief carried the workaround.
- The first `npm install -w <new workspace> <pkg>` only linked the workspace and dropped the package silently (wave 0).
- Merging 1b conflicted only in `package-lock.json`. The orchestrator took `main`'s copy and regenerated it with `npx -y npm@11.21.3 install`.
- `pkill -f concurrently ; pkill -f "next dev" ; ...` killed the orchestrator's own shell and returned exit code 144. This happened 7 times over the session; the orchestrator then checked ports in a separate call.

## Phase 2, agent platform, Planner and Status updater (21 Nov, 15:31 to 22:02)

**Goal.** The hand-written tool-use loop, the real and mock model layer, traces, optional Langfuse, async runs, the server-side kill switch, the Planner with the Today page, and the Status updater with its UI.

**Workers.** 6 workers in 3 waves, all Opus:

| Wave | Worker                    | Effort | Parallel with |
| ---- | ------------------------- | ------ | ------------- |
| A    | Phase 2 shared contract   | high   | alone         |
| B1   | API agent core and runs   | xhigh  | B2            |
| B2   | Web Today page and run UX | high   | B1, then C3   |
| C3   | Web status-update UI      | high   | B1, C1, C2    |
| C1   | Planner agent             | xhigh  | C2, C3        |
| C2   | Status updater agent      | xhigh  | C1, C3        |

**What was generated.**

- A: agent run, trace, Planner and Status updater schemas, `AGENT_LIMITS`, tool input schemas. Shared tests went to 71.
- B1: `runAgent`, tool types, `TraceRecorder`, the LLM client with the mock and `registerMockScript`, the Langfuse tracer, the `agent_runs` migration, the run service and `/api/agents` routes, `apps/api/src/agents/README.md`. Dependencies `ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@langfuse/tracing`, `@langfuse/otel`, `@opentelemetry/sdk-trace-base`, each with a reason in the commit.
- B2: the agent-run entity with polling, `useAgentRunner`, the trace timeline, the Mock AI badge, the plan-day feature and the Today page.
- C1: the Planner (candidate score in code, `PLANNER_PROMPT_V1`, validation after the loop, a deterministic mock).
- C2: the Status updater (scope, prompt, output checks, Slack text built in code, mock).
- C3: the write-status-update feature, Write status update on task detail and My update on the toolbar.

**Measured.**

- B1: 91 API tests. Live server with `LLM_MOCK=true`: 202 then a polled run, 409 on cancelling a finished run, 403 with AI off. A hand-inserted `running` row became `failed` with `interrupted` after restart. Langfuse: the API sent gzip OTLP JSON with Basic auth to a local fake receiver at `/api/public/otel/v1/traces`, carrying the trace name, tags and `runId` metadata.
- B2: 121 web tests; 50 Playwright checks against a fixture API.
- C1: 11 Planner tests; 11 mutations each failed a test (the first try missed the blocked-penalty mutation, so the test was strengthened). On the real seed the mock plan was PD-1, PD-10 and PD-7.
- C2: 17 new tests; 3 mutations each failed the intended test. Six live requests on the seed, including the needs-notes path and its re-run with a note.
- C3: 145 API, 49 shared and 71 web tests at its base; a Playwright pass at all widths in both themes.
- Integration (orchestrator, real stack, `LLM_MOCK=true`): Plan my day, My update, Write status update and the needs-notes flow worked at 1280 dark, 768 light and 375 dark. Tests on `main`: API 118, web 145, shared 71.

**Differed from the spec or brief.**

- B1: `run` returns `{ output }` only; usage is summed from the trace. Tools are passed as plain JSON schemas (`jsonSchema(z.toJSONSchema(...))`) so all validation happens in the loop. The kill switch sets runs to `cancelled` with code `ai_disabled`. Reconcile ran inside `bootDatabase` (later found to be a bug, see the review).
- C1: subtasks are left out of the candidate table, because on the seed a parent and its own subtask would fill two of three plan slots. The run fails with `nothing_valid` before any model call when no unblocked task exists.
- C2: blockers come first in the Slack text (the spec says blocked work "goes first"); one line per item; an empty since window fails with `nothing_valid`; `prepare` returns the input the run stores (a small change to shared agent code).
- C3: Regenerate without a tone change sends no tone; edits survive closing the dialog.

**Unsure about, and to check by hand.**

- A: `needs_notes` carried only task ids (the orchestrator added `tasks: [{ taskId, identifier, title }]` before wave B); what counts toward `changedSince`; duplicate task ids are not rejected by the schemas.
- B1: no real model or real Langfuse server was used; how tags show in a real Langfuse UI; the `@opentelemetry/sdk-trace-base` deprecation warning.
- C1: the score weights are "a judgment call".
- C2: the prompt wording and how a real model handles it.
- C3: Retry after a notes save could save the notes twice if the POST landed but the first poll failed; copy fallback over plain http; screen reader output of the tone picker.

**Bugs found.**

- B1, by checking exit codes: a test typecheck failure that `tail` had hidden (fix `4eee674`).
- Integration: after merging B1, the web typecheck failed because the exhaustive `AGENT_ERROR_LABEL` lacked the new `internal_error`. B1 had warned about it. Fixed in `7a9be30`.
- C1 and C2 both edited `test/agents/runs.test.ts`; the orchestrator deleted the whole stub test at merge.

**Human input.** "Let's move on to phase 2". After the rate limit: "Proceed with the implementation".

**Failures and recoveries.** At 16:15 the 5-hour usage limit stopped B1 and B2 (HTTP 429). At 19:13 the orchestrator resumed both with `SendMessage`; B1 had 2 commits, B2 had only started. The orchestrator ran out of context and the session was continued from a summary at 20:37.

## Phase 3, Decomposer in suggest mode (22 Nov, 09:30 to 15:12)

**Goal.** Batch decomposition, the related-task pass, per-task clarifications, claims, the suggestion review UI and the orange dot.

**Workers.** 4 workers in 2 waves, all Opus: D0 (contract, tables and repositories, xhigh) alone, then D1 (suggestion routes, xhigh), D2 (Decomposer agent and routes, xhigh) and D3 (web UI, high) in parallel.

**What was generated.**

- D0: suggestion and Decomposer schemas, `agent_suggestions` and `agent_claims` with repositories, `aiState` derived in one SQL CASE, boot reconcile of claims and `aiState`, `pendingSuggestions` on task detail, test fixtures.
- D1: `GET /api/suggestions`, accept and reject, `applySuggestion`, shared `insertSubtasks`.
- D2: `agents/decomposer/` (eligibility, prompt, tools, validate, apply, mock, README), the run and clarify routes, `onStep` in `runAgent`, `mode` on agent definitions.
- D3: the suggestion entity, the AI dot with a processing ring, the review panel (subtasks draft reducer, clarification form, related review), the Decompose dialog.

**Measured.**

- D0: API 153, web 145, shared 93. 5 mutations caught (precedence, expired claims, boot claims, related groups, `updatedAt` bump). A crash simulation with `kill -9` reset `processing` and cleared claims.
- D1: 20 new tests; 5 mutations caught; atomicity tested by forcing the third subtask's identifier to collide. Curl against the real API covered every branch.
- D2: 28 new tests; 8 mutations caught (the claim-check mutation survived at first; the cap test was tightened). On the seed one mock run gave 5 subtask proposals, 2 clarifications, 1 skip and 1 duplicates group (PD-12 and PD-26).
- D3: web 186 tests; 42/42 browser flow checks against a fixture API.
- Integration (orchestrator, real stack, mock): edit and accept, answering a clarification, Generate anyway, the related link, the Decompose dialog, at 375, 768 and 1280 px. Tests on `main`: API 203, web 186, shared 93.

**Differed from the spec or brief.**

- D2: a task edited during the run saves no suggestion; the outcome is `superseded` (the spec said the row is saved as superseded; the spec was changed to match). Stage 3 runs per task as each loop ends. A batch fails only if every task it reached failed.
- D1: "already has subtasks" read as "got subtasks after the suggestion was created"; an edited related payload may drop tasks but not add any.
- D3: no multi-select, so Decompose always does the default run; Plan my day became icon-only below 768 px.
- Commit trailers: the briefs asked for `Claude Sonnet 5.5`. D0 used `Claude Opus 5.5` because "The harness attribution says this session runs on Opus 5.5". Several later workers did the same.

**Unsure about, and to check by hand.**

- D0: a rejected related suggestion puts every task of the group in the 7-day cooldown, which blocks decomposing those tasks.
- D2: whether saving nothing (rather than a superseded row) is right; skipped tasks save no row, so PD-27 is reconsidered on every run.
- D3: the tooltip on the dot is hover-only; the task title textarea is 35 px on mobile.

**Bugs found.**

- D3, by its browser pass: "New task" was cut off at 375 px once Decompose was added.
- Orchestrator integration: after accepting the duplicates link, the next run proposed the same PD-12 and PD-26 pair again. Fix `48a8786` drops a group whose tasks are already linked, with a regression test.

**Human input.** "Yes, go on to phase 3". After the rate limit: "Proceed with implementation". At the end: "Yep, go on".

**Failures and recoveries.** At 13:54 the usage limit stopped D1, D2 and D3. The orchestrator resumed all three at 14:39.

## Phase 4, auto mode, Inbox and rollback (22 Nov, 15:17 to 21:37)

**Goal.** Auto-apply as a changeset, the notifications Inbox, rollback, the mode switch.

**Workers.** 4 workers in 2 waves, all Opus: E0 (changesets and notifications foundation, xhigh) alone, then E1 (Decomposer auto apply, xhigh), E2 (notifications and rollback API, xhigh) and E3 (Inbox and rollback web UI, high) in parallel.

**What was generated.**

- E0: changeset and notification schemas with `changesetStatusOf` and `changesetTaskStateOf`, the two tables and repositories, `rollbackRules.ts`, `markSuggestionsRolledBack`.
- E1: `linkGroup` shared with accept, the auto applier, `notify.ts` (summary and conflict notifications in a `finally`), `agent_failed` for Decomposer failures.
- E2: the notifications routes and `POST /api/changesets/:id/rollback`, all in one transaction, idempotent.
- E3: the notification entity, the nav unread badge, the Inbox page, the rollback dialog, auto results in the Decompose dialog, new Auto copy in Settings.

**Measured.**

- E0: API 228, shared 113. 3 mutations caught. An upgraded copy of a phase 1 database migrated and kept its 27 tasks.
- E1: 23 new tests; 5 mutations caught (re-prioritizing the parent, no transaction, mode read late, notify only on completion, star from the highest id). On the seed in auto mode: 15 subtasks under 5 tasks, notification "Split 5 tasks into 15 subtasks, 2 tasks need your answers, 2 tasks may be duplicates."
- E2: 19 new tests; 5 mutations caught; a real-stack curl run with per-task and full rollback, the kept list and the idempotent repeat.
- E3: web 229 tests; 48/48 browser checks against a fixture API.
- Integration (orchestrator, real stack, mock, Auto): per-task rollback, rollback everything with one edited subtask kept ("1 subtask was edited and kept"), the cooldown on the second run. Tests on `main`: API 266, web 229, shared 113.

**Differed from the spec or brief.**

- E0 asked whether a subtask with notes should be kept on rollback, because a note does not bump `updatedAt`. The orchestrator decided at the merge to keep it (`d5b023b`, "feat(shared): keep a subtask with notes on rollback") and changed the spec.
- E2: an item the user already deleted counts as `rolled_back`, not `kept`; the spec line was changed. A rollback with no body undoes the whole changeset.
- E1: summary wording beyond the example; the conflict notification lists only edited tasks; `agent_failed` also fires for clarify reruns and in suggest mode.
- E3: the commit trailer used `Claude Sonnet 5.5`, because "my first commit attempt with that wording was rejected" when it tried Opus.

**Unsure about, and to check by hand.**

- E2: "A subtask the user linked by hand still counts as untouched ... Rolling it back deletes that link through the cascade." The orchestrator passed this to the author as a decision. It was not decided before the review found it (see below).
- E2: a rollback during a running auto run leaves the ops added later `applied`.
- E1: a subtask added by hand during an auto run does not bump the parent's `updatedAt`, so auto mode adds its subtasks next to it (documented as a known limit; the review then fixed it).

**Human input.** "Keep working" after the rate limit. At 21:21: "can you stop agents to restart this session with the new settings.json for claude?". The orchestrator stopped E1, E2 and E3 with `TaskStop` and listed their worktrees and saved work. After the restart: "continue phase 4". The orchestrator resumed the same three agents by `SendMessage`.

**Failures and recoveries.**

- At 19:08 the usage limit stopped E1, E2 and E3; they were resumed at 20:56.
- The original worktrees of E1, E2 and E3 disappeared during the rate-limit restart. Each worker recreated one with `git worktree add` (`e1-decomposer-auto`, `e2-rollback`, `e3-web`). E2 lost nothing because it had no changes yet.
- E3 found that symlinked `node_modules` broke the Turbopack build and ran a real `npm ci` in its worktree.

## Four-way review (22 Nov 21:45 to 23 Nov 08:53)

**Goal.** "spawn agents to review the current implementation and possible hot or weak spots to fix or improve" (the author). Review only, no edits.

**Workers.** 4 reviewers in parallel: API integrity and concurrency (Fable, high), agent platform and prompts (Fable, high), web UX and architecture (Opus, high), tests, DX, security and hygiene (Opus, high). Each marked a finding VERIFIED or SUSPECTED and left repro files in the scratchpad.

**Main findings, with who found them.**

- Two Decomposer runs can split one task twice; auto mode creates duplicate subtask sets. Found by both the API and the agent-platform reviewer, reproduced with test files. The platform reviewer: "The mock hides this. Its titles are deterministic, so `checkProposal`'s title dedupe turns the second run into `skipped`."
- Rollback silently deletes links the user drew to an auto-created subtask. API reviewer, rated critical. This was the case E2 had flagged as a decision.
- A second process (`npm run dev` twice, or `npm run db:seed`) marks the live process's runs failed before it fails on the busy port. API reviewer.
- Cross-site POSTs work on body-less routes (reject, rollback, cancel, mark read), and the API listened on every interface. API and QA reviewers; QA rolled back a real changeset with a `text/plain` POST from `Origin: https://evil.example` and reached the API from the LAN address.
- A clarify rerun in auto mode creates todo subtasks under a done task. Platform reviewer.
- Two invalid tool calls in one step fail the run before the model can correct them; real providers send parallel calls by default. Platform reviewer, reproduced with the real Anthropic provider on a fake fetch.
- A cut-off answer at the 2,048-token cap shows up as `no_terminal_tool` or `validation_failed`. Claude sometimes sends nested arrays as JSON strings. Both: platform reviewer.
- Prompt injection: the Status updater's tool results and all note bodies were untagged; the clarify `question` text went into the prompt raw. Platform reviewer.
- A missing key silently selects the mock, and in auto mode the mock writes fake subtasks into real data. Platform reviewer, "decision risk".
- No limit on runs: 30 parallel Decomposer starts all returned 202. QA reviewer.
- A root `.env` `API_PORT` broke every `/api` call from the web app, because Next.js only loads `apps/web/.env*`. QA reviewer.
- `npm run format:check` failed on a fresh clone (drizzle meta files); no root `build` script; the AI-off end-to-end test lacked one `.expect(201)`. QA reviewer.
- Web coverage 46.3 % of lines (API 94.2 %, shared 100 %); 41 of 181 web files at 0 %. 24 of 26 high-risk mutations killed. QA reviewer.
- Web: a 403 `ai_disabled` never refreshed settings, so AI entry points stayed on screen; your own edit made your own Accept fail with 409 stale; Today and Inbox went blank when settings failed; Start made the plan look stale; closing the panel replaced history; focus was lost after closing; light-theme amber text at about 2.5:1 contrast; small touch targets. Web reviewer, 8 of 13 findings reproduced in a browser.
- Spec gaps: task detail has no latest agent trace, and the trace panel has no Langfuse link. QA and web reviewers.
- Checked and found solid (QA): no flaky tests in 18 shuffled runs and 12 runs under load, no `eslint-disable`, `@ts-ignore` or `any`, `.env.example` matches `config/env.ts` key for key.

**Failures and recoveries.** At 21:55 the usage limit stopped all four reviewers. They were resumed at 08:47 the next morning. The platform reviewer's worktree was deleted mid-review; it re-ran its probes on a fresh detached worktree.

**Human input.** "keep working".

## Review fix lanes F1, F2 and F3 (23 Nov, 08:52 to 13:57)

**Goal.** Fix the confirmed findings in three lanes with disjoint files.

**Workers.** F1 API integrity, security and DX (Opus, xhigh); F2 agent platform and Decomposer (Opus, xhigh); F3 web (Opus, high). F1 and F2 started before the web review landed; F3 started a minute after it.

**Decisions by the orchestrator, stated before the lanes ran.** A missing key keeps selecting the mock ("which is what lets a fresh clone work"), and F2 only documents it. Two-tab PATCH stays last-writer-wins with a spec note. Web coverage stays a known gap "unless you want a test dependency added".

**Scope cut.** At 10:50 the usage limit stopped all three lanes. At 13:42 the author asked "how much work do they have?". The orchestrator counted "roughly 12 of 33 items done". The author: "Let's wrap up the f3 and decrease the number of tasks for f1 and f2". The orchestrator sent each lane a closing set and a list to skip.

**What was done.**

- F3 (merged `9ae6d6d`): `ai_disabled` revalidates settings through SWR `onError`; Accept sends the `updatedAt` shown at click time; a shared `load-error` block on Today and Inbox; `unexplainedChanges` so Start does not mark the plan stale; close pushes history; focus returns to the row; light `--brand-text: #a14a06` (5.85:1, darker than the suggested `#b45309`, which was about 4.4:1 on the hover background); 40 px targets. Focus-after-close was finished before the scope cut, so the worker kept it.
- F2 (merged `0f2fda2`): `exclusion` and `writeConflict` after the claim and inside the stage-3 transaction; clarify answers 409 on a done or split task, and moving a task to done supersedes its pending subtasks and clarification suggestions; invalid calls counted per step; `finishReason === "length"` fails with a clear message, default cap 4,096 and 8,192 for the Decomposer task loop, subtask descriptions capped at 1,500 characters; stringified nested fields parsed; `runAgent` tags every read-tool result (`<task>`, `<note>`) and escapes lookalike brackets; clarify Q lines built from stored questions.
- F1 (merged `d8d5db2`): `has_links` keep reason on rollback; `API_HOST` (default `127.0.0.1`), `next dev --hostname 127.0.0.1`, `crossSiteGuard` (415 unless JSON, 403 on cross-site); reconcile moved into the `listen` callback (`src/lifecycle.ts`) and a 5-second clean shutdown; `RUN_SLOTS` with 409 on a taken slot; `.prettierignore` for drizzle meta, a root `build`, `next.config.ts` loading the root `.env`; the 500-body test and `.expect(201)`; the last-writer-wins spec line.

**Measured.**

- F3: before and after flows for every fix; a final sweep of 30 page loads with 0 px overflow, no console errors and no contrast violations.
- F2: red-before for each fix (6 of 6 race tests failed before, 7 injection tests failed against the previous source); 4 mutations on the final head. F2 found the mock cannot prove the race fix, because the mock is fully synchronous and two runs never overlap on the real stack ("that pass proves nothing"). It ran the real Anthropic provider against a local fake server with 300 ms latency: the base source gave "PD-16: 4 subtasks, from runs [2, 1], TWO SETS"; the fixed head gave one set per task.
- F1: red-before for each regression test; a real-stack script showed 415, 403, a LAN connection refused, a second API exiting with EADDRINUSE without touching run 999, and SIGTERM exiting 0.
- After all merges: API 316, web 240, shared 114; typecheck, lint, `format:check` and the root build clean. The orchestrator re-ran the critical rollback fix on the real stack: the subtask with the user's link was kept with "has links".

**Not done (skipped by the scope cut).** F1: own codes for 413 and 415, the delete-parent-with-1000-subtasks 500, the boot-time `aiState` index, documenting that migrations and seed are two transactions. F2: the rate-limit message and token budget ("the SDK's internal retry rethrows only the abort error when the wall clock fires during a retry-after wait"), Planner and Status updater validation, the adversarial test file, the related-links cap. F3: the run-progress live region, cross-tab plan marks, the theme-script console error. Not assigned: web test coverage, the latest trace on task detail, the Langfuse link.

**Merge problems.**

- F1's JSON-only guard broke 29 existing tests that sent body-less writes; F1 added a `jsonClient(app)` helper and switched 11 setups, 5 of them in F2's folder.
- After merging F1 on top of F2, two F2 race tests failed: F1's one-batch-at-a-time rule answered 409 to the second batch. The orchestrator rewrote them to run the second batch as a second API process on the same database (`3b6b1b0`).
- F1 left two stale lines in `apps/api/src/agents/README.md`; the orchestrator fixed them after the merge.

## OpenRouter (24 Nov, 00:05 to 00:10)

- The author: "how to use models from openrouter?". The orchestrator read the registry and the installed SDK and answered that the OpenAI provider defaults to the Responses API, which OpenRouter serves only partly. It proposed an `openrouter` provider of "about 10 lines and no new dependency".
- The author: "yep, implement it". The orchestrator implemented it itself, with no worker (`98c94a8`, "feat(api): add the openrouter provider"): `OPENROUTER_API_KEY` and the provider name in `config/env.ts`, `openRouterLlm` in `agents/core/llm.ts` using `createOpenAI` with `https://openrouter.ai/api/v1` and `.chat()`, docs, and `test/agents/openrouter.test.ts` with a fake fetch.
- Measured: the request goes to `/chat/completions` with the bearer key and the full model id; `GET /api/agents/info` reports `real` with a key and `mock` without. "I did not send any request to OpenRouter, so no project data left your machine." Tests: API 319, web 240, shared 114.

## Background runs, lanes G1 and G2 (24 Nov, 09:01 to 09:37)

**Goal.** The author: "can our agents work on the background? for example, when a user activates one of them and leaves the page?". The orchestrator answered that runs already execute in the API process, but nothing lets the user find a run again, and only auto-mode and failed Decomposer runs reach the Inbox. It offered a Runs indicator (1), an Inbox notification for unwatched runs (2), and a persisted job queue (3, "I wouldn't do it for this project"). The author: "Let's move on with options 1 and 2".

**Workers.** The orchestrator committed the contract itself first (`b27c9e4`: `run_finished` kind and a `label` on run summaries). Then G1 API (Opus, xhigh) and G2 web (Opus, high) in parallel.

**What was generated.** G1: `services/runNotifications.ts`, the 8-second watch window kept in memory, `run_finished` and `agent_failed` rules, boot and shutdown notifications. G2: the `/runs` page with deep links, the nav running indicator, reattach links instead of blind 409s, `run_finished` Inbox cards.

**Measured.** G1: API 358; 7 mutations caught; real stack with the API frozen by `SIGSTOP` for 9 s so a run counted as unwatched, and a `kill -9` mid-run that produced one `agent_failed` on the next boot and none on a second boot. G2: web 277; 42/42 browser checks against a fixture API; a sweep of `/runs`, `/inbox` and `/today` with 0 axe violations. Orchestrator integration: the frozen-API case produced the Inbox card, and Open result went to `/runs?run=1`. Tests on `main` after the merge: API 358, web 277, shared 114.

**Differed from the brief.** G1 made starting a run count as watching it: "Mock runs take 25 to 130 ms, so they end before the page's first poll arrives." Under the brief's rule every watched mock run would have notified. The cost: a real-model run that ends within 8 s after the user left at once gets no notification. G2 reads the run scope from the label text, copied from the API ("A `scope` field on summaries would be cleaner").

**Bugs found.** G2's browser pass: a SWR `refreshInterval` function decided the first poll before data loaded, so the running list waited 15 s and the history never polled (fix `e1c4a1d`). B2 had hit and avoided the same SWR behaviour in phase 2.

**Merge problems.** One conflict in the mobile top bar: the author's commit `cc2e7cd` added `cursor-pointer`, G2 changed the menu label; the orchestrator kept both.

**Slip reported by the orchestrator.** "my first test build pointed the web app at port 4000, so a few read-only GETs reached your API before I rebuilt. Nothing was changed."

**Author commits in this window.** `cc2e7cd` "fix(web): add the missing cursor pointer to buttons", `2127e9e` "fix(web): center the empty inbox message on the inbox page", `e7baed1` "fix(web): add the cursor pointer to the select component". These, with `8e04e3a`, are the only 4 commits on `main` without a Claude trailer.

## Daily scheduled runs (24 Nov, 09:43 to 10:24)

- The author: "when do we run our agents?". The orchestrator checked every place a run starts: only buttons and the run endpoints, "There is no cron, interval or scheduler in the API." It proposed a daily Planner, a Decomposer on task create or nightly, and a Status updater digest, and warned that a scheduler "that quietly spends money should be opt-in".
- The author: "Let's add a daily scheduled planner run and status updater. The first runs in the morning at 8 am, and the second runs in the evening at 6 pm. But we should keep the functionality to trigger them manually".
- One worker (Opus, xhigh). The orchestrator set `scheduledRunsEnabled` on by default "since you asked for the feature" and listed it as an open decision: a fresh clone with no key runs the mock Planner and Status updater twice a day.
- The spec's "Out of scope" still lists "Agents running in the background on a schedule. Every agent run is started by the user." The worker added a "daily runs decision" to sections 4 and 11 but did not change that line (unverified whether that was deliberate).
- The worker stopped at the usage limit (10:17) before sending a report, so there is no hand-back for this wave. The orchestrator merged its branch (`4d27247`) and ran the gates itself. Its commits: `e2bc88e` (trigger column, migration `0004_agent_runs_trigger.sql`, setting), `81df33d` (`src/scheduler.ts`, a 30-second tick, a 6-hour catch-up window, `lastScheduledRun:<agent>` dates written in the transaction that inserts the run), `b1142ac` (Daily runs switch, Scheduled badge), `be4d98e` (docs).
- Measured by this docs worker on a fresh clone at 10:27 local time: the API logged "Daily runs: planner at 08:00, status_updater at 18:00, Europe/Lisbon time", started "the scheduled planner run #1 for 2026-11-24" 30 s after listening (inside the catch-up window), and the Inbox got "Your plan for today is ready".
- "what is happening" (the author, 09:57). The orchestrator: "Nothing is broken. The scheduler worker is running, but it has only just started."

## README and these notes (24 Nov, from 10:14)

- The author: "Let's wrap up our implementation, we have to write down agents_log.md and readme". The orchestrator asked how to handle the parts the spec reserves; the author picked "Follow the spec (Recommended)": the full README except the two reserved sections, plus this notes file.
- The first docs worker stopped at the usage limit (10:17) before writing anything. Its worktree was gone when it was resumed; this run used a fresh worktree.
- Later messages from the author: "finish the readme and agent log", then "don't overthink over readme and agents log, just write down them". This run still left `AGENT_LOG.md` to the author, following the earlier "Follow the spec" choice and the brief. See the open questions.

## Recurring problems: what the agents got wrong

- **The mock model hid real-model failures.** Parallel invalid calls, truncated answers, nested JSON strings, rate limits and the duplicate-split race all passed on the mock. The race could not even be reproduced on the real stack with the mock, because it is synchronous.
- **Concurrency and state rules missed in the first build.** Duplicate splits from overlapping runs, the clarify rerun under a done task, reconcile at boot instead of after `listen`, no run limit.
- **Rollback rules missed what does not bump `updatedAt`.** Notes (caught by the orchestrator at the E0 merge) and user links (caught by the review, after E2 had flagged it).
- **Security defaults.** The API first listened on every interface and accepted body-less cross-site POSTs.
- **Prompt-injection gaps.** Tagging was per agent, so the Status updater and note bodies were missed until `runAgent` did it for all agents.
- **Fresh-clone DX.** `format:check` red, no root `build`, root `.env` `API_PORT` ignored by the web proxy.
- **Web state bugs found only in a browser.** The SWR optimistic matcher crash, form races, the kill switch not reaching the settings cache, Accept failing after your own edit, blank pages, the SWR `refreshInterval` function (hit twice).
- **No committed browser tests.** Every browser check ran in throwaway Playwright scripts; the repo's web tests cannot click anything.
- **Shell habit.** `pkill -f` with a pattern that matched its own command killed the orchestrator's shell 7 times (exit 144).
- **Commit trailers.** The briefs asked for `Claude Sonnet 5.5`; many workers wrote `Claude Opus 5.5` instead. On `main`: 79 Opus trailers and 84 Sonnet trailers.
- **Spec drift.** Agents edited the author's spec 17 times to record decisions, and one out-of-scope line now contradicts the scheduled runs.

## Numbers

Measured on `main` at `4d27247` on 24 Nov.

Commits (`git rev-list --count HEAD`, `git rev-list --merges --count HEAD`): 166 commits, 21 of them merges, 145 non-merge.

Non-merge commits by type:

```sh
git log --no-merges --format='%s' | sed -E 's/^([a-z]+)(\(.*\))?!?:.*/\1/' | sort | uniq -c | sort -rn
```

| Type     | Commits |
| -------- | ------- |
| feat     | 68      |
| fix      | 38      |
| docs     | 18      |
| refactor | 6       |
| chore    | 6       |
| test     | 5       |
| build    | 3       |
| style    | 1       |

Merged waves (`git log --merges`): phase 1 (2 merges; the other phase 1 branches were fast-forwarded), phase 2 (5), phase 3 (4), phase 4 (4), review fixes (3), background runs (2), daily runs (1). OpenRouter was a direct commit.

Workers spawned: 28 with a report (5 in phase 1, 6 in phase 2, 4 in phase 3, 4 in phase 4, 4 reviewers, 3 fix lanes, 2 background-run lanes), plus the scheduler worker and the docs worker without one. Usage-limit stops (HTTP 429): 6, on 21 Nov 16:15, 22 Nov 13:54, 22 Nov 19:08, 22 Nov 21:55, 23 Nov 10:50 and 24 Nov 10:17.

Tests (`npm run test` on a fresh clone, all passing):

| Workspace         | Files | Tests |
| ----------------- | ----- | ----- |
| `@postdog/api`    | 36    | 383   |
| `@postdog/web`    | 48    | 280   |
| `@postdog/shared` | 12    | 115   |
| Total             | 96    | 778   |

Test counts at the end of each wave (API, web, shared): phase 1 49, 86, 35; phase 2 118, 145, 71; phase 3 203, 186, 93; phase 4 266, 229, 113; review fixes 316, 240, 114; OpenRouter 319, 240, 114; background runs 358, 277, 114; daily runs 383, 280, 115.

Lines of TypeScript (tracked `.ts` and `.tsx` files, comments and blank lines included):

```sh
for d in apps/api/src apps/api/test apps/web/src apps/web/app packages/shared/src; do
  printf "%s " $d; git ls-files "$d" | grep -E '\.(ts|tsx)$' | xargs cat | wc -l
done
```

| Path                  | Lines  |
| --------------------- | ------ |
| `apps/api/src`        | 7,424  |
| `apps/api/test`       | 8,526  |
| `apps/web/src`        | 14,392 |
| `apps/web/app`        | 7      |
| `packages/shared/src` | 2,367  |

The web and shared counts include their test files, which sit next to the source.

## Open questions for the author

- Should `AGENT_LOG.md` stay yours to write? Your last messages ask to "write down" the agents log; this run followed your earlier "Follow the spec" answer and wrote only these notes.
- Was the spec review ("Review the spec first") planned, and did you want the agents to edit your spec 17 times, or only to report?
- Which worker reports did you read in full during the build, and which decisions did you make yourself versus accept from the orchestrator (for example the Planner score weights, blockers-first in the Status updater, subtasks left out of the Planner table)?
- Is "Daily runs" on by default what you want for reviewers who clone without a key?
- Should the spec's "Out of scope" line about scheduled runs be changed?
- Do you want the remaining review items (token budget, Planner and Status updater validation, latest trace on task detail, Langfuse link, web interaction tests) as next steps, or as accepted limits?
- Why were two reviewers on Fable and the rest on Opus, and how did their findings compare in your view?
- How did the 5-hour usage limit and the restarts affect your plan and time budget (the brief budgets 8 to 10 hours)?
- Which commit trailer is correct, `Claude Opus 5.5` or `Claude Sonnet 5.5`?
- Should `CLAUDE.md` (untracked for the whole session) and `.claude/settings.json` (tracked) stay as they are?
- Will you run one real model before submitting, so the README can name a tested model?
