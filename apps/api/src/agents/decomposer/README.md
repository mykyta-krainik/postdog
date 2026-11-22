# Decomposer

The Decomposer splits a batch of tasks into subtasks (spec 8.2). Phase 3 runs it in suggest mode only: every result is a suggestion the user reviews, and nothing changes a task. One task that needs a question answered never holds up the others.

| File             | What it holds                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| `index.ts`       | `createDecomposerAgent(loops?)`, `createDecomposerClarifyAgent(loops?)`, the two agents and the orchestration. |
| `eligibility.ts` | `selectBatch`: stage 0, which tasks the run works on and why the others are left out.                          |
| `prompt.ts`      | `DECOMPOSER_PROMPT_V1` (`related` and `task`), the batch table and the per-task message.                       |
| `tools.ts`       | The terminal tools and the `get_task` and `search_tasks` read tools with user text in `<task>` tags.           |
| `validate.ts`    | `checkRelatedGroups` and `checkProposal`: the checks in code after each loop.                                  |
| `apply.ts`       | Stage 3: the `Applier` for each mode, `appliedMode` and `applierFor`.                                          |
| `mock.ts`        | `relatedMockScript` and `taskMockScript`, registered for the `decomposer:related` and `decomposer:task` loops. |

## Routes

Both answer `202 { runId }`, behind `aiEnabledGuard`. The run's `input` is the request body, its `output` is `decomposerOutputSchema`, and `agent` is `decomposer` for both.

- `POST /api/agents/decomposer/run` with `{ taskIds? }`. A task id that does not exist answers 400.
- `POST /api/agents/decomposer/clarify` with `{ suggestionId, answers }` or `{ suggestionId, generateAnyway: true }`. A missing suggestion answers 404, one that is not a clarification 400, and one that is no longer pending 409.

## Stages

**Stage 0, eligibility (code).** A task is eligible when it is top-level, `todo`, has no subtasks, has no active claim (`findActiveClaim`, so an expired claim does not count), has no pending suggestion, and no suggestion for it was rejected or rolled back in the last 7 days (`listTaskIdsInCooldown`). The check reads claims and pending suggestions directly instead of the stored `aiState`, which an expired claim can leave at `processing`. The batch is at most `AGENT_LIMITS.maxDecomposerTasksPerRun` (10) tasks, high priority first, then the oldest. Without `taskIds`, ineligible tasks are left out silently, except claimed ones, which are listed as `claimed`. With `taskIds`, every task that is left out is listed with why. With nothing eligible, the run completes with no model call, zero counts and the warning "No eligible tasks".

**Stage 1, related pass (one loop).** Skipped when the batch has one task. The model gets a table of the batch (id, identifier, priority, title, a 160-character summary of the description) and `search_tasks` and `get_task`, and ends with `report_related`. Code then drops, each with a warning, ids that do not exist or are done or subtasks (unless they are in the batch), groups with fewer than 2 ids left, groups with no batch task, and groups that repeat an earlier one. If this loop fails, the run carries on without related tasks and says so in a warning. A cancel still stops the run.

**Stage 2, one loop per task.** `AGENT_LIMITS.decomposerConcurrency` (3) loops run at a time, each settled on its own, so a failed loop becomes a `failed` outcome with the error's message and the other tasks go on. Tasks in a duplicates group that holds 2 or more batch tasks are left out with the outcome `duplicate` and the related suggestion's id. Every other related group the task is in is listed in its message, so the model does not propose work a related task already covers. Read tools are `get_task` and `search_tasks`. The terminal tools are `propose_subtasks`, `ask_clarification` and `skip`. Trace steps of a task loop start with the task's identifier, because loops run at the same time.

**Stage 3, apply (code).** `applierFor(ctx.mode)` picks the `Applier`. Each task's result is applied as soon as its loop ends, while the task is still claimed. Related groups are applied right after stage 1, so a duplicate outcome can point at its suggestion.

| Result                 | Suggest mode                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| `propose_subtasks`     | A `subtasks` suggestion; the task's `aiState` becomes `suggestion_pending`. Outcome `suggested_subtasks`.      |
| `ask_clarification`    | A `clarification` suggestion; `aiState` becomes `clarification_pending`. Outcome `needs_clarification`.        |
| `skip`                 | No suggestion. Outcome `skipped` with `reason: explanation` as the detail.                                     |
| Related group          | One `related` suggestion: `targetId` is the lowest id and `payload.taskIds` lists every task. Not saved twice. |
| Task edited in the run | No suggestion. Outcome `superseded`, "PD-12 was edited while the Decomposer worked".                           |

## Output checks

`propose_subtasks` is checked by its Zod schema inside the loop (2 to 8 subtasks, lengths). After the loop, `checkProposal` drops, each with a warning and a `validation` trace step, a subtask whose title (trimmed, case-insensitive, spaces collapsed) repeats the task's own title, an existing subtask or an earlier subtask in the proposal. With fewer than 2 left, the outcome becomes `skipped` with the detail `already_atomic: all proposed subtasks were duplicates` (or `only one proposed subtask was not a duplicate`). The model's `priority` is stored as given, and a missing one stays missing.

The run completes even when some tasks fail. It fails, with the first task's error, only when every task it reached failed and it saved no related group. A clarify run therefore fails when its one loop fails.

## Claims

Each stage 2 loop claims its task with `tryClaim` before it starts. When another run holds the task, the outcome is `claimed`, "Skipped PD-12: being processed by decomposer run #41", and no loop runs. `runAgent`'s `onStep` hook calls `renewClaims` after every model call. The loop releases its own claim in a `finally`, so a task's orange processing state ends as soon as its result is saved, also when the loop throws. When the run ends or is cancelled, the run service releases any claim that is left. A worker that has not started yet checks the abort signal before it claims, so a cancelled run does not claim more tasks.

Stage 1 takes no claims. Two runs started at the same moment can both find the same related group; the second one sees the pending suggestion and does not save it again.

## Stale writes

The applier reloads the task. If its `updatedAt` is later than the run's `startedAt`, the user changed it while the model worked, and the result is not saved (outcome `superseded`). A deleted task gets the same outcome. A related group is not saved when any of its tasks was edited, and a warning says which one. Only user edits bump `updatedAt`, so the run's own claim and suggestion writes never trip this check.

## Clarify

`/decomposer/clarify` re-runs stage 2 for the clarification's task with the earlier questions, what was unclear, and either the user's answers (in `<answer>` tags) or the Generate anyway instruction added to the first message. With `generateAnyway`, `ask_clarification` is not offered at all, so a call to it gets the usual unknown-tool error. The task is claimed like in a batch run, and there is no eligibility check, because the task has a pending clarification by definition.

The old clarification is marked `superseded` in the same transaction that saves the new result, and only when the result is settled: a new subtasks or clarification suggestion, or a skip. When the rerun fails, loses the claim to another run, or finds the task edited, the clarification stays pending, so the user does not lose the question and can answer again.

## Modes

`decomposerAgent.mode(db)` returns `appliedMode(decompositionMode setting)`, which the run service stores on the run as `mode` and passes as `ctx.mode`. Phase 3 has only the suggest applier, so an `auto` setting runs as `suggest`, the run records `mode: "suggest"`, and the trace gets the step "Auto mode arrives in phase 4, saved as a suggestion". Phase 4 adds an `auto` entry to `APPLIERS` in `apply.ts`.

## Mock scripts

Both scripts are deterministic and read only the first message.

- `decomposer:related` reads the batch table and pairs tasks whose title keywords (lowercased, stop words removed, a light stem) overlap: a Jaccard score of 0.6 or more is `duplicates`, 0.4 or more `overlaps`. When it finds a pair, it calls `search_tasks` with the shared words first.
- `decomposer:task` uses the Generate anyway instruction first (3 subtasks, assumptions in the rationale), then the user's answers (one subtask per answer between a plan and a test step). Without either, a title of fewer than 4 words or with a vague word (`thing`, `stuff`, ...) gets `ask_clarification`; a title that starts with a one-step verb (`Fix`, `Bump`, `Rename`, `Reindex`, `Revert`, `Restart`) or a description under 20 characters gets `skip` with `already_atomic`; anything else calls `get_task`, then proposes "Plan: ...", "Build: ..." and "Test and roll out: ..." built from the title and description.

On the seed, a default run splits 5 tasks, asks about "Improve performance" and "Fix the onboarding thing", skips "Reindex search after the schema change", and puts the two rate-limit tasks in a duplicates group. The seed needed no new rows. Tests pass their own loop names to `createDecomposerAgent` and `createDecomposerClarifyAgent` and register scripts under them.

## Known limits

- No docs tools, pinned docs or team conventions yet (phase 5).
- A skipped task has no suggestion row, so the next run looks at it again.
- Stage 1 compares the batch with itself and with what `search_tasks` finds. It does not see every open task.
- Suggestions saved before a cancel stay pending.
- Nothing here has been run against a real model. The prompts are untested beyond the mock.
