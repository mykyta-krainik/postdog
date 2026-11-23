import { jsonSchema, tool, type ToolSet } from "ai";
import { z } from "zod";

export interface ReadTool<N extends string = string, S extends z.ZodType = z.ZodType, O = unknown> {
  name: N;
  description: string;
  input: S;
  terminal?: false;
  run(input: z.output<S>): O;
  summarize?(output: Awaited<O>): string;
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
}): ReadTool<N, S, O> {
  return definition;
}

export function defineTerminalTool<const N extends string, S extends z.ZodType>(definition: {
  name: N;
  description: string;
  input: S;
}): TerminalTool<N, S> {
  return { ...definition, terminal: true };
}

type JsonSchemaInput = Parameters<typeof jsonSchema>[0];

function inputJsonSchema(t: AgentTool) {
  return z.toJSONSchema(t.input, { target: "draft-7", io: "input" });
}

export function toToolSet(tools: readonly AgentTool[]): ToolSet {
  return Object.fromEntries(
    tools.map((t) => [
      t.name,
      tool({
        description: t.description,
        inputSchema: jsonSchema(inputJsonSchema(t) as JsonSchemaInput),
      }),
    ]),
  );
}

/** The top-level input keys whose schema is an array or an object. */
export function structuredKeys(t: AgentTool): ReadonlySet<string> {
  const properties = inputJsonSchema(t).properties ?? {};
  return new Set(
    Object.entries(properties)
      .filter(
        ([, schema]) =>
          typeof schema === "object" && ["array", "object"].includes(`${schema.type}`),
      )
      .map(([key]) => key),
  );
}

/**
 * Some models send a nested array or object as a JSON string, as in {"subtasks": "[...]"}.
 * Parses such a value back, only at the given keys, and keeps any string that is not JSON.
 */
export function parseStringifiedFields(input: unknown, keys: ReadonlySet<string>): unknown {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return input;
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      keys.has(key) && typeof value === "string" && /^\s*[[{]/.test(value) ? parseOr(value) : value,
    ]),
  );
}

function parseOr(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
    .join("; ");
}
