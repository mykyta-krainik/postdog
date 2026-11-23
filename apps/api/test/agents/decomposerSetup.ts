import { decomposerRunSchema, type DecomposerOutput, type DecomposerRun } from "@postdog/shared";
import { expect } from "vitest";
import { createApp } from "../../src/app";
import {
  registerMockScript,
  type MockConversation,
  type MockTurn,
} from "../../src/agents/core/llm";
import { createDecomposerAgent, createDecomposerClarifyAgent } from "../../src/agents/decomposer";
import { agentRegistry } from "../../src/agents/registry";
import { seedDatabase } from "../../src/db/seed";
import { jsonClient, type Api } from "../helpers";
import { createTestDb } from "../suggestionFixtures";
import { call, script, waitForRun, type Step } from "./helpers";

export const T0 = Date.UTC(2026, 10, 1, 9);

export type TaskHandler = (
  taskId: number,
  conversation: MockConversation,
) => MockTurn | Promise<MockTurn>;

let handlerCount = 0;

function byTask(handler: TaskHandler): string {
  const name = `test_decomposer_task_${++handlerCount}`;
  registerMockScript(name, (conversation) =>
    handler(Number(/^id: (\d+)$/m.exec(conversation.userMessage)![1]), conversation),
  );
  return name;
}

/** The real app on a fresh database, with the Decomposer's loops scripted per test. */
export function setup(options: { seed?: boolean; related?: Step[]; task?: TaskHandler } = {}) {
  const db = createTestDb();
  if (options.seed) seedDatabase(db, Date.now());
  const related = options.related && script(options.related);
  const loops = {
    ...(related && { related: related.name }),
    ...(options.task && { task: byTask(options.task) }),
  };
  const agents = {
    ...agentRegistry,
    decomposer: createDecomposerAgent(loops),
    decomposer_clarify: createDecomposerClarifyAgent(loops),
  };
  return {
    db,
    api: jsonClient(createApp(db, { agents })),
    /** A second API process on the same database: it has its own run slots, so it can overlap. */
    otherProcess: () => jsonClient(createApp(db, { agents })),
    relatedSeen: related?.seen ?? [],
  };
}

export async function startRun(api: Api, path: string, body: object): Promise<DecomposerRun> {
  const res = await api.post(`/api/agents/decomposer/${path}`).send(body).expect(202);
  expect(Object.keys(res.body)).toEqual(["runId"]);
  return decomposerRunSchema.parse(await waitForRun(api, res.body.runId as number));
}

export const runDecomposer = (api: Api, body: object = {}) => startRun(api, "run", body);
export const clarify = (api: Api, body: object) => startRun(api, "clarify", body);

export function outputOf(run: DecomposerRun): DecomposerOutput {
  expect(run.error).toBeNull();
  expect(run.status).toBe("completed");
  return run.output!;
}

export function outcomes(output: DecomposerOutput): Record<string, string> {
  return Object.fromEntries(output.tasks.map((t) => [t.title, t.outcome]));
}

export const propose = (...titles: string[]) =>
  call("propose_subtasks", {
    subtasks: titles.map((title) => ({ title, description: "" })),
    rationale: "Split it.",
  });

export const twoSteps = () => propose("Step one", "Step two");

export const ask = call("ask_clarification", {
  questions: ["What does done look like?"],
  whatIsUnclear: "No outcome.",
});

export const noGroups = call("report_related", { groups: [] });
