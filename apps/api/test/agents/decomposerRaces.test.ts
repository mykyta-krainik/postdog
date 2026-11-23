import { decomposerRunSchema, type DecompositionMode } from "@postdog/shared";
import { describe, expect, it } from "vitest";
import type { MockTurn } from "../../src/agents/core/llm";
import type { Db } from "../../src/db/client";
import { insertSuggestion, listSuggestions } from "../../src/repositories/suggestions";
import { listAllTasks } from "../../src/repositories/tasks";
import type { Api } from "../helpers";
import { addRun, addTask, subtasksFor } from "../suggestionFixtures";
import { noGroups, outputOf, propose, runDecomposer, setup } from "./decomposerSetup";
import { waitForRun } from "./helpers";

const MODES = ["auto", "suggest"] as const;

const setMode = (api: Api, decompositionMode: DecompositionMode) =>
  api.patch("/api/settings").send({ decompositionMode }).expect(200);

function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { open, opened };
}

const subtaskTitles = (db: Db, parentId: number) =>
  listAllTasks(db)
    .filter((t) => t.parentId === parentId)
    .sort((a, b) => a.id - b.id)
    .map((t) => t.title);

const subtaskSuggestions = (db: Db, taskId: number) =>
  listSuggestions(db, { targetType: "task", targetId: taskId }).filter(
    (s) => s.kind === "subtasks",
  );

/** A real model words each proposal differently, so title dedupe cannot hide a second split. */
function wordedPerCall() {
  const calls: number[] = [];
  const handler = (taskId: number) => {
    calls.push(taskId);
    const n = calls.length;
    return propose(`Design the change, take ${n}`, `Ship the change, take ${n}`);
  };
  return { calls, handler };
}

describe("two Decomposer runs that both select a task", () => {
  for (const mode of MODES) {
    it(`${mode}: the run that claims it second leaves it alone, without a model call`, async () => {
      const related = gate();
      const model = wordedPerCall();
      const { db, api } = setup({
        related: [
          async () => {
            await related.opened;
            return noGroups;
          },
        ],
        task: model.handler,
      });
      await setMode(api, mode);
      const x = addTask(db, { title: "Add SSO" });
      const y = addTask(db, { title: "Add an audit log" });

      const late = await api
        .post("/api/agents/decomposer/run")
        .send({ taskIds: [x.id, y.id] })
        .expect(202);
      const first = await runDecomposer(api, { taskIds: [x.id] });
      expect(outputOf(first).tasks[0]!.outcome).toBe(
        mode === "auto" ? "applied_subtasks" : "suggested_subtasks",
      );
      related.open();
      const second = decomposerRunSchema.parse(await waitForRun(api, late.body.runId as number));

      expect(model.calls.filter((id) => id === x.id)).toHaveLength(1);
      const result = outputOf(second).tasks.find((t) => t.taskId === x.id);
      expect(result).toMatchObject({
        outcome: "skipped",
        detail:
          mode === "auto"
            ? `Skipped ${x.identifier}: it already has 2 subtasks`
            : `Skipped ${x.identifier}: it has a pending suggestion to review first`,
      });
      expect(subtaskTitles(db, x.id)).toEqual(
        mode === "auto" ? ["Design the change, take 1", "Ship the change, take 1"] : [],
      );
      expect(subtaskSuggestions(db, x.id).map((s) => s.runId)).toEqual([first.id]);
    });
  }
});

describe("stage 3 reads the task again before it writes", () => {
  for (const mode of MODES) {
    it(`${mode}: a subtask the user adds during the loop wins, and nothing is written`, async () => {
      const loop = gate();
      const { db, api } = setup({
        task: async (): Promise<MockTurn> => {
          await loop.opened;
          return propose("Write the migration", "Add tests");
        },
      });
      await setMode(api, mode);
      const x = addTask(db, { title: "Add SSO" });

      const res = await api
        .post("/api/agents/decomposer/run")
        .send({ taskIds: [x.id] })
        .expect(202);
      await api.post("/api/tasks").send({ title: "Pick the IdP", parentId: x.id }).expect(201);
      loop.open();
      const run = decomposerRunSchema.parse(await waitForRun(api, res.body.runId as number));

      expect(outputOf(run).tasks).toEqual([
        expect.objectContaining({
          outcome: "superseded",
          suggestionId: null,
          detail: `${x.identifier} got 1 subtask while the Decomposer worked`,
        }),
      ]);
      expect(subtaskTitles(db, x.id)).toEqual(["Pick the IdP"]);
      expect(subtaskSuggestions(db, x.id)).toEqual([]);
    });

    it(`${mode}: a pending split another run saved during the loop wins`, async () => {
      let other = 0;
      const { db, api } = setup({
        task: (taskId) => {
          insertSuggestion(db, subtasksFor(other, taskId, Date.now()));
          return propose("Write the migration", "Add tests");
        },
      });
      await setMode(api, mode);
      const x = addTask(db, { title: "Add SSO" });
      other = addRun(db);

      const output = outputOf(await runDecomposer(api, { taskIds: [x.id] }));
      expect(output.tasks).toEqual([
        expect.objectContaining({
          outcome: "superseded",
          detail: expect.stringMatching(
            new RegExp(
              `^${x.identifier} already has subtasks suggestion #\\d+ from run #${other}$`,
            ),
          ),
        }),
      ]);
      expect(subtaskTitles(db, x.id)).toEqual([]);
      expect(subtaskSuggestions(db, x.id).map((s) => s.runId)).toEqual([other]);
    });
  }
});
