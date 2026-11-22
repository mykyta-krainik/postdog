import type { AgentName, DecompositionMode } from "@postdog/shared";
import type { ZodType } from "zod";
import type { Db } from "../../db/client";
import type { LoopDeps } from "./runAgent";

export interface AgentContext extends LoopDeps {
  runId: number;
  startedAt: number;
  mode: DecompositionMode | null;
  db: Db;
}

export interface AgentDefinition<I = unknown, O = unknown> {
  name: AgentName;
  promptVersion: string;
  input: ZodType<I>;
  output: ZodType<O>;
  prepare?(db: Db, input: I, startedAt: number): I;
  mode?(db: Db): DecompositionMode;
  run(ctx: AgentContext, input: I): Promise<{ output: O }>;
}

export function defineAgent<I, O>(definition: AgentDefinition<I, O>): AgentDefinition<I, O> {
  return definition;
}
