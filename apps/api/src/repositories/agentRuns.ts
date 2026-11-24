import type { AgentName, RunStatus } from "@postdog/shared";
import { and, desc, eq, type SQL } from "drizzle-orm";
import type { Executor } from "../db/client";
import { agentRuns, type AgentRunRow, type NewAgentRunRow } from "../db/schema";

export interface RunListFilter {
  agent?: AgentName;
  status?: RunStatus;
  limit: number;
}

export type RunFinish = Pick<AgentRunRow, "status" | "error" | "finishedAt"> &
  Partial<Pick<AgentRunRow, "output" | "trace" | "usage">>;

const summaryColumns = {
  id: agentRuns.id,
  agent: agentRuns.agent,
  mode: agentRuns.mode,
  status: agentRuns.status,
  promptVersion: agentRuns.promptVersion,
  input: agentRuns.input,
  error: agentRuns.error,
  langfuseTraceId: agentRuns.langfuseTraceId,
  usage: agentRuns.usage,
  llm: agentRuns.llm,
  startedAt: agentRuns.startedAt,
  finishedAt: agentRuns.finishedAt,
};

const newestFirst = [desc(agentRuns.startedAt), desc(agentRuns.id)];

export function insertRun(ex: Executor, row: NewAgentRunRow): AgentRunRow {
  return ex.insert(agentRuns).values(row).returning().get();
}

export function findRun(ex: Executor, id: number): AgentRunRow | undefined {
  return ex.select().from(agentRuns).where(eq(agentRuns.id, id)).get();
}

/** A run row without its output and trace, as the list needs it. `input` only feeds the label. */
export type RunListRow = Pick<AgentRunRow, keyof typeof summaryColumns>;

export function listRuns(ex: Executor, filter: RunListFilter): RunListRow[] {
  const conditions: SQL[] = [];
  if (filter.agent) conditions.push(eq(agentRuns.agent, filter.agent));
  if (filter.status) conditions.push(eq(agentRuns.status, filter.status));
  return ex
    .select(summaryColumns)
    .from(agentRuns)
    .where(and(...conditions))
    .orderBy(...newestFirst)
    .limit(filter.limit)
    .all();
}

export function findLatestRun(
  ex: Executor,
  agent: AgentName,
  status: RunStatus,
): AgentRunRow | undefined {
  return ex
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.agent, agent), eq(agentRuns.status, status)))
    .orderBy(desc(agentRuns.finishedAt), desc(agentRuns.id))
    .get();
}

export function listRunningRunIds(ex: Executor): number[] {
  return ex
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .where(eq(agentRuns.status, "running"))
    .all()
    .map((row) => row.id);
}

export function updateRun(
  ex: Executor,
  id: number,
  changes: Partial<Pick<AgentRunRow, "trace" | "usage" | "langfuseTraceId">>,
): void {
  ex.update(agentRuns).set(changes).where(eq(agentRuns.id, id)).run();
}

export function finishRun(ex: Executor, id: number, finish: RunFinish): boolean {
  return (
    ex
      .update(agentRuns)
      .set(finish)
      .where(and(eq(agentRuns.id, id), eq(agentRuns.status, "running")))
      .run().changes > 0
  );
}

export function failRunningRuns(ex: Executor, finish: Omit<RunFinish, "status">): number {
  return ex
    .update(agentRuns)
    .set({ ...finish, status: "failed" })
    .where(eq(agentRuns.status, "running"))
    .run().changes;
}
