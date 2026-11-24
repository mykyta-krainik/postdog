import { LangfuseSpanProcessor } from '@langfuse/otel';
import {
  LangfuseOtelSpanAttributes,
  setLangfuseTracerProvider,
  startObservation,
  type LangfuseAgent,
  type LangfuseGeneration,
  type LangfuseTool,
} from '@langfuse/tracing';
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import type { AgentName, LlmMode } from '@postdog/shared';
import type { Env } from '../../config/env';
import { logger } from '../../lib/logger';

export interface ObservationResult {
  output?: unknown;
  error?: string;
}

export interface GenerationResult extends ObservationResult {
  usage?: { input: number; output: number };
}

export interface Observation<R = ObservationResult> {
  end(result: R): void;
}

export interface RunTracer {
  readonly traceId: string | null;
  generation(start: { name: string; model: string; input: unknown }): Observation<GenerationResult>;
  span(start: { name: string; input: unknown }): Observation;
  end(result: ObservationResult): void;
}

export interface RunTraceStart {
  runId: number;
  agent: AgentName;
  promptVersion: string;
  mode: LlmMode;
  input: unknown;
}

export interface Tracer {
  readonly enabled: boolean;
  startRun(start: RunTraceStart): RunTracer;
  flush(): Promise<void>;
}

const noopObservation: Observation<GenerationResult> = { end: () => {} };

export const noopRunTracer: RunTracer = {
  traceId: null,
  generation: () => noopObservation,
  span: () => noopObservation,
  end: () => {},
};

export const noopTracer: Tracer = {
  enabled: false,
  startRun: () => noopRunTracer,
  flush: async () => {},
};

type LangfuseEnv = Pick<Env, 'LANGFUSE_PUBLIC_KEY' | 'LANGFUSE_SECRET_KEY' | 'LANGFUSE_BASE_URL'>;

export function createTracer(env: LangfuseEnv): Tracer {
  const { LANGFUSE_PUBLIC_KEY: publicKey, LANGFUSE_SECRET_KEY: secretKey } = env;
  if (!publicKey || !secretKey) return noopTracer;
  return createLangfuseTracer({ publicKey, secretKey, baseUrl: env.LANGFUSE_BASE_URL });
}

function createLangfuseTracer(config: {
  publicKey: string;
  secretKey: string;
  baseUrl?: string;
}): Tracer {
  const processor = new LangfuseSpanProcessor(config);
  setLangfuseTracerProvider(new BasicTracerProvider({ spanProcessors: [processor] }));

  return {
    enabled: true,
    startRun(start) {
      try {
        return startLangfuseRun(start);
      } catch (err) {
        logger.error('Langfuse could not start a trace; this run is not traced', { err });
        return noopRunTracer;
      }
    },
    flush: () => processor.forceFlush(),
  };
}

function startLangfuseRun(start: RunTraceStart): RunTracer {
  const root = startObservation(
    start.agent,
    { input: start.input, metadata: { runId: start.runId } },
    { asType: 'agent' },
  );
  root.otelSpan.setAttributes({
    [LangfuseOtelSpanAttributes.TRACE_NAME]: start.agent,
    [LangfuseOtelSpanAttributes.TRACE_TAGS]: [start.mode, start.promptVersion],
    [`${LangfuseOtelSpanAttributes.TRACE_METADATA}.runId`]: String(start.runId),
  });

  const finish = (
    observation: LangfuseAgent | LangfuseGeneration | LangfuseTool,
    result: GenerationResult,
  ) => {
    observation.update({
      output: result.output,
      ...(result.error !== undefined && { level: 'ERROR', statusMessage: result.error }),
      ...(result.usage && { usageDetails: result.usage }),
    });
    observation.end();
  };

  return {
    traceId: root.traceId,
    generation: ({ name, model, input }) => {
      const generation = root.startObservation(name, { model, input }, { asType: 'generation' });
      return { end: (result) => finish(generation, result) };
    },
    span: ({ name, input }) => {
      const span = root.startObservation(name, { input }, { asType: 'tool' });
      return { end: (result) => finish(span, result) };
    },
    end: (result) => finish(root, result),
  };
}
