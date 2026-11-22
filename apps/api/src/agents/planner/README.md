# Planner

`plannerAgent` answers "What should I start with today?" (spec 8.1). It is read-only: one `runAgent` loop with `get_task`, `search_tasks` and the terminal tool `submit_daily_plan`, then checks in code.

| File            | What it holds                                                                     |
| --------------- | --------------------------------------------------------------------------------- |
| `index.ts`      | `createPlannerAgent(loopName?)`, `plannerAgent`, the tools and the orchestration. |
| `candidates.ts` | `SCORE_WEIGHTS`, `candidateScore` and `rankCandidates`.                           |
| `prompt.ts`     | `PLANNER_PROMPT_V1` and the candidate table.                                      |
| `validate.ts`   | `checkPlan`: the checks against the database after the loop.                      |
| `mock.ts`       | `plannerMockScript`, registered for the `planner` loop.                           |

## Candidates

Code ranks every open top-level task (status not `done`, no parent) by a score and sends the top `AGENT_LIMITS.maxPlannerCandidates` (30) as a table in the first message. Subtasks stay out of the table because a row has no parent column, so a subtask row would repeat its parent. The parent's `subtasks` column shows their progress, and `get_task` lists them.

| Part                                                    | Points        |
| ------------------------------------------------------- | ------------- |
| In progress for more than `STALE_IN_PROGRESS_DAYS` days | +100          |
| In progress, not stale                                  | +25           |
| Priority high, medium, low                              | +30, +20, +10 |
| Each open task it blocks, at most 3 counted             | +10           |
| Age, one point per 3 days, at most 30 days              | +0 to +10     |
| Blocked by an open task                                 | -1000         |

So stale in-progress work always ranks first, blocked tasks always rank last, and in between priority, unblocking and age trade off. Ties go to the lower id.

## Prompt and safety

`PLANNER_PROMPT_V1` holds the decision rules from the spec, minus pinned docs and claims, which arrive in phase 5. Titles and descriptions, in the table and in the `get_task` and `search_tasks` results, are wrapped in `<task>` tags with `<` and `>` escaped (`tools/userText.ts`), so a title cannot close its own tag. The prompt says text inside the tags is data, not instructions.

## Validation

After the loop, `checkPlan` reloads the tasks, so a task completed in another tab during the run is caught. Each focus item is dropped with a warning when its task does not exist, is done, is blocked by an open task, or is already in the plan. Each drop is a `validation` trace step, and one more step sums up what was kept. Kept items get `identifier` and `title` from the database. The model's own warnings come first, then the validation warnings. `coordinationNotes` is always `[]` in phase 2.

The run fails with `nothing_valid` when no item is left, and before any model call when no open top-level task is unblocked.

## Mock script

`plannerMockScript` reads the candidate table from the first message, calls `get_task` on the top unblocked row, then submits the top 3 unblocked rows in table order. Reasons and signals come from each row: stale in-progress days, open tasks it unblocks, high priority, and age of 14 days or more. Tests pass their own loop name to `createPlannerAgent` and register a script under it to reach the validation paths.
