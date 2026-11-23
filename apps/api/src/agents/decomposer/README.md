# Decomposer

The Decomposer splits a batch of tasks into subtasks (spec 8.2). In suggest mode, every result is a suggestion the user reviews. In auto mode, it creates the subtasks and `relates` links itself, records them in the run's changeset, and tells the user in the Inbox. One task that needs a question answered never holds up the others.

| File             | What it holds                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| `index.ts`       | `createDecomposerAgent(loops?)`, `createDecomposerClarifyAgent(loops?)`, the two agents and the orchestration. |
| `eligibility.ts` | `selectBatch` and `exclusion`: stage 0, which tasks the run works on and why the others are left out.          |
| `prompt.ts`      | `DECOMPOSER_PROMPT_V1` (`related` and `task`), the batch table and the per-task message.                       |
| `tools.ts`       | The terminal tools and the `get_task` and `search_tasks` read tools with user text in `<task>` tags.           |
| `validate.ts`    | `checkRelatedGroups` and `checkProposal`: the checks in code after each loop.                                  |
| `apply.ts`       | Stage 3: `writeConflict`, the `Applier` for each mode, `applierFor` and `decompositionMode`.                   |
| `notify.ts`      | The auto run's notifications: `notifyAutoRun` and the message builders `autoRunMessage` and `conflictMessage`. |
| `mock.ts`        | `relatedMockScript` and `taskMockScript`, registered for the `decomposer:related` and `decomposer:task` loops. |

## Routes

Both answer `202 { runId }`, behind `aiEnabledGuard`. The run's `input` is the request body, its `output` is `decomposerOutputSchema`, and `agent` is `decomposer` for both.

- `POST /api/agents/decomposer/run` with `{ taskIds? }`. A task id that does not exist answers 400.
- `POST /api/agents/decomposer/clarify` with `{ suggestionId, answers }` or `{ suggestionId, generateAnyway: true }`. A missing suggestion answers 404, one that is not a clarification 400, and one that is no longer pending 409. A task that is done or already has subtasks answers 409 `conflict` too, and no run starts.

## Stages

**Stage 0, eligibility (code).** A task is eligible when it is top-level, `todo`, has no subtasks, has no active claim (`findActiveClaim`, so an expired claim does not count), has no pending suggestion, and no suggestion for it was rejected or rolled back in the last 7 days (`listTaskIdsInCooldown`). The check reads claims and pending suggestions directly instead of the stored `aiState`, which an expired claim can leave at `processing`. The batch is at most `AGENT_LIMITS.maxDecomposerTasksPerRun` (10) tasks, high priority first, then the oldest. Without `taskIds`, ineligible tasks are left out silently, except claimed ones, which are listed as `claimed`. With `taskIds`, every task that is left out is listed with why. With nothing eligible, the run completes with no model call, zero counts and the warning "No eligible tasks".

**Stage 1, related pass (one loop).** Skipped when the batch has one task. The model gets a table of the batch (id, identifier, priority, title, a 160-character summary of the description) and `search_tasks` and `get_task`, and ends with `report_related`. Code then drops, each with a warning, ids that do not exist or are done or subtasks (unless they are in the batch), groups with fewer than 2 ids left, groups with no batch task, and groups that repeat an earlier one. If this loop fails, the run carries on without related tasks and says so in a warning. A cancel still stops the run.

**Stage 2, one loop per task.** `AGENT_LIMITS.decomposerConcurrency` (3) loops run at a time, each settled on its own, so a failed loop becomes a `failed` outcome with the error's message and the other tasks go on. Tasks in a duplicates group that holds 2 or more batch tasks are left out with the outcome `duplicate` and the related suggestion's id. Every other related group the task is in is listed in its message, so the model does not propose work a related task already covers. Read tools are `get_task` and `search_tasks`. The terminal tools are `propose_subtasks`, `ask_clarification` and `skip`. The loop may answer with up to 8,192 tokens per step: 8 subtasks with 1,500-character descriptions (the cap in `subtaskProposalSchema`) are about 3,500 tokens, and a model may write text before its tool call. Trace steps of a task loop start with the task's identifier, because loops run at the same time.

**Stage 3, apply (code).** `applierFor(ctx.mode)` picks the `Applier`. Each task's result is applied as soon as its loop ends, while the task is still claimed. Related groups are applied right after stage 1, so a duplicate outcome can point at its suggestion. Each task and each group is applied in its own transaction, so a throw writes nothing of that item. A task whose transaction throws gets the outcome `failed`, and the other tasks go on.

| Result                 | Suggest mode                                                                                                   | Auto mode                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `propose_subtasks`     | A `subtasks` suggestion; the task's `aiState` becomes `suggestion_pending`. Outcome `suggested_subtasks`.      | The subtasks are created and the suggestion is saved as `applied`, with no orange dot. Outcome `applied_subtasks`. |
| `ask_clarification`    | A `clarification` suggestion; `aiState` becomes `clarification_pending`. Outcome `needs_clarification`.        | The same. A question is never answered automatically.                                                              |
| `skip`                 | No suggestion. Outcome `skipped` with `reason: explanation` as the detail.                                     | The same.                                                                                                          |
| Related `overlaps`     | One `related` suggestion: `targetId` is the lowest id and `payload.taskIds` lists every task. Not saved twice. | `relates` links are created and the suggestion is saved as `applied`. `related[].applied` is `true`.               |
| Related `duplicates`   | The same as `overlaps`.                                                                                        | A pending suggestion, like suggest mode. Merging is never automatic.                                               |
| Task edited in the run | No suggestion. Outcome `superseded`, "PD-12 was edited while the Decomposer worked".                           | The same, and the task is listed in the run's `conflict` notification.                                             |

## Output checks

`propose_subtasks` is checked by its Zod schema inside the loop (2 to 8 subtasks, lengths). After the loop, `checkProposal` drops, each with a warning and a `validation` trace step, a subtask whose title (trimmed, case-insensitive, spaces collapsed) repeats the task's own title, an existing subtask or an earlier subtask in the proposal. With fewer than 2 left, the outcome becomes `skipped` with the detail `already_atomic: all proposed subtasks were duplicates` (or `only one proposed subtask was not a duplicate`). The model's `priority` is stored as given, and a missing one stays missing.

The run completes even when some tasks fail. It fails, with the first task's error, only when every task it reached failed and it saved no related group. A clarify run therefore fails when its one loop fails.

## Claims

Each stage 2 loop claims its task with `tryClaim` before it starts. When another run holds the task, the outcome is `claimed`, "Skipped PD-12: being processed by decomposer run #41", and no loop runs. Once claimed, the task is read again and checked with stage 0's `exclusion` (the run's own claim and suggestions do not count) and with `writeConflict` (below), because another run may have split it since this run's stage 0. Two runs started at once, or from two tabs, both select the same task, and the one that claims it second gets `skipped` ("Skipped PD-12: it already has 3 subtasks" in auto mode, "it has a pending suggestion to review first" in suggest mode) without a model call. `runAgent`'s `onStep` hook calls `renewClaims` after every model call. The loop releases its own claim in a `finally`, so a task's orange processing state ends as soon as its result is saved, also when the loop throws. When the run ends or is cancelled, the run service releases any claim that is left. A worker that has not started yet checks the abort signal before it claims, so a cancelled run does not claim more tasks.

Stage 1 takes no claims. Two runs started at the same moment can both find the same related group; the second one sees the pending suggestion and does not save it again.

## Stale writes

Stage 3 calls `writeConflict` in the transaction that would write, before the `Applier` runs, so both modes get the same check. It reads the task again and saves nothing (outcome `superseded`, the reason as the detail) when the task was deleted, its `updatedAt` is later than the run's `startedAt` (the user edited it), it is done, it has subtasks (the user added one by hand, which does not bump `updatedAt`), or another run left a pending `subtasks` or `clarification` suggestion on it. The clarification a rerun answers does not count. In auto mode, the superseded tasks that still exist are also listed in the run's `conflict` notification. A related group is not saved when any of its tasks was edited, and a warning says which one. Only user edits bump `updatedAt`, so the run's own claim and suggestion writes never trip this check.

## Clarify

`/decomposer/clarify` re-runs stage 2 for the clarification's task with the earlier questions, what was unclear, and either the user's answers (in `<answer>` tags) or the Generate anyway instruction added to the first message. With `generateAnyway`, `ask_clarification` is not offered at all, so a call to it gets the usual unknown-tool error. The task is claimed like in a batch run. Stage 0's `exclusion` does not apply, because the user asked for the rerun and the task has a pending clarification by definition, but `writeConflict` does, both after the claim and before the write, with the answered clarification left out. Moving a task to done supersedes its pending `subtasks` and `clarification` suggestions (`services/tasks.ts`), so a question about finished work does not linger.

The rerun applies its result in the mode Settings have when the rerun starts. In auto mode, a subtasks result is created right away and recorded in the rerun's own changeset, and the rerun writes its own notifications. The old clarification is marked `superseded` in the same transaction that saves the new result, and only when the result is settled: a new subtasks or clarification suggestion, created subtasks, or a skip. When the rerun fails, loses the claim to another run, or finds the task edited, the clarification stays pending, so the user does not lose the question and can answer again.

## Modes

`decompositionMode(db)` reads the `decompositionMode` setting. The run service calls it once, when the run starts, stores the result on the run as `mode`, and passes it as `ctx.mode`. A run keeps that mode to the end, so switching Settings during a run changes only the next run. `APPLIERS` in `apply.ts` maps each mode to its `Applier`.

## Auto mode

For a `propose_subtasks` result, one transaction does three things:

1. `insertSubtasks` from `services/tasks.ts` creates the subtasks, the same function the accept route uses. Each subtask is `todo`, `medium` when the item has no priority, and the parent's `updatedAt` stays as it is.
2. `appendChangesetOps` adds one `create_task` op per subtask to the run's changeset, with `taskId` set to the parent. The first op creates the changeset.
3. `insertSuggestion` saves the `subtasks` suggestion with status `applied`, so the 7-day rule and rollback can find it.

An `overlaps` group is linked with `linkGroup` from `services/suggestions.ts`, the accept route's star: one `relates` link from the lowest id to every other task, with `createdBy: "agent:<runId>"`. A pair that already has a `relates` link, in either direction, is skipped. Each link becomes a `create_link` op whose `taskId` is the lowest id, and the group's suggestion is saved as `applied`.

The output's `changesetId` is the run's changeset, or `null` when the run created nothing. `counts.appliedSubtasks` counts tasks with the outcome `applied_subtasks`. `counts.createdSubtasks` and `counts.appliedLinks` count the changeset's `create_task` and `create_link` ops.

### Hard limits

Auto mode never edits, deletes or re-prioritizes an existing task, and it creates only subtasks and `relates` links. The auto applier enforces this by its imports: it calls `insertSubtasks`, `linkGroup`, `appendChangesetOps` and `insertSuggestion`, and reads with `findTask` and `listSuggestions`. It never calls `updateTask` or `deleteTask`. A test runs auto mode on the seed and checks that every existing task row, apart from `aiState`, and every existing link is unchanged.

### Notifications

When an auto run ends, `notifyAutoRun` writes up to two notifications in one transaction.

- `conflict`, when the user edited tasks during the run. The title is "PD-7 was edited during the run" or "3 tasks were edited during the run". The body says that the Decomposer skipped them, changed nothing, and that they can be decomposed again. A task deleted during the run is not listed.
- `auto_decomposition`, when the run applied something or left something for the user. The title is the first part of the summary, for example "Split 4 tasks into 13 subtasks". The body is the whole summary, for example "Split 4 tasks into 13 subtasks, linked 2 related tasks, 2 tasks need your answers." Parts that are zero are left out. Pending duplicates add "2 tasks may be duplicates". `changesetId` is the run's changeset, and the notifications repository embeds its per-task list.

A suggest run writes neither. A run that ends `failed` with any code other than `cancelled` or `ai_disabled` also gets one `agent_failed` notification, "The Decomposer failed", with the error message as the body. The run service writes it for the Decomposer only, in both modes, in the transaction that finishes the run.

### Cancel and failure

Each applied task is committed when its loop ends, so a cancel, the AI kill switch, or a later failure keeps everything applied so far. The run's notifications are written in a `finally` block, so applied work always shows in the Inbox. When the run did not complete, the summary ends with "The run stopped before it finished; what it did is kept." A loop that has not reached stage 3 when the run is cancelled writes nothing.

## Mock scripts

Both scripts are deterministic and read only the first message.

- `decomposer:related` reads the batch table and pairs tasks whose title keywords (lowercased, stop words removed, a light stem) overlap: a Jaccard score of 0.6 or more is `duplicates`, 0.4 or more `overlaps`. When it finds a pair, it calls `search_tasks` with the shared words first.
- `decomposer:task` uses the Generate anyway instruction first (3 subtasks, assumptions in the rationale), then the user's answers (one subtask per answer between a plan and a test step). Without either, a title of fewer than 4 words or with a vague word (`thing`, `stuff`, ...) gets `ask_clarification`; a title that starts with a one-step verb (`Fix`, `Bump`, `Rename`, `Reindex`, `Revert`, `Restart`) or a description under 20 characters gets `skip` with `already_atomic`; anything else calls `get_task`, then proposes "Plan: ...", "Build: ..." and "Test and roll out: ..." built from the title and description.

On the seed, a default run splits 5 tasks, asks about "Improve performance" and "Fix the onboarding thing", skips "Reindex search after the schema change", and puts the two rate-limit tasks in a duplicates group. In auto mode, the same run creates 15 subtasks under the 5 tasks, links nothing, and writes the notification "Split 5 tasks into 15 subtasks, 2 tasks need your answers, 2 tasks may be duplicates." A second auto run looks only at the skipped task. The seed needed no new rows. Tests pass their own loop names to `createDecomposerAgent` and `createDecomposerClarifyAgent` and register scripts under them.

## Known limits

- No docs tools, pinned docs or team conventions yet (phase 5).
- A skipped task has no suggestion row, so the next run looks at it again.
- Stage 1 compares the batch with itself and with what `search_tasks` finds. It does not see every open task.
- Suggestions saved before a cancel stay pending, and subtasks and links created before a cancel stay in place.
- The `conflict` notification says a superseded task "was edited during the run" whatever the reason in its detail, such as a subtask the user added.
- Nothing here has been run against a real model. The prompts are untested beyond the mock.
