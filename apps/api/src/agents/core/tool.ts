import { jsonSchema, tool, type ToolSet } from "ai";
import { z } from "zod";

export interface ReadTool<N extends string = string, S extends z.ZodType = z.ZodType> {
  name: N;
  description: string;
  input: S;
  terminal?: false;
  run(input: z.output<S>): unknown;
  summarize?(output: unknown): string;
}

export interface TerminalTool<N extends string = string, S extends z.ZodType = z.ZodType> {
  name: N;
  description: string;
  input: S;
  terminal: true;
}

export type AgentTool = ReadTool | TerminalTool;

export type TerminalCall<T extends AgentTool> =
  T extends TerminalTool<infer N, infer S> ? { toolName: N; output: z.output<S> } : never;

export function defineReadTool<const N extends string, S extends z.ZodType, O>(definition: {
  name: N;
  description: string;
  input: S;
  run(input: z.output<S>): O;
  summarize?(output: Awaited<O>): string;
}): ReadTool<N, S> {
  return definition as ReadTool<N, S>;
}

export function defineTerminalTool<const N extends string, S extends z.ZodType>(definition: {
  name: N;
  description: string;
  input: S;
}): TerminalTool<N, S> {
  return { ...definition, terminal: true };
}

type JsonSchemaInput = Parameters<typeof jsonSchema>[0];

export function toToolSet(tools: readonly AgentTool[]): ToolSet {
  return Object.fromEntries(
    tools.map((t) => [
      t.name,
      tool({
        description: t.description,
        inputSchema: jsonSchema(
          z.toJSONSchema(t.input, { target: "draft-7", io: "input" }) as JsonSchemaInput,
        ),
      }),
    ]),
  );
}

export function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
    .join("; ");
}
