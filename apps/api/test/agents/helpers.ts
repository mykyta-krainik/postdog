import { agentRunSchema, type AgentRun } from '@postdog/shared';
import { z } from 'zod';
import { ToolError } from '../../src/agents/core/errors';
import {
  mockLlm,
  registerMockScript,
  type MockConversation,
  type MockTurn,
} from '../../src/agents/core/llm';
import type { LoopDeps } from '../../src/agents/core/runAgent';
import { defineReadTool, defineTerminalTool } from '../../src/agents/core/tool';
import { createTraceRecorder } from '../../src/agents/core/trace';
import { noopRunTracer } from '../../src/agents/core/tracer';
import type { Api } from '../helpers';

let scriptCount = 0;

export type Step = MockTurn | ((conversation: MockConversation) => MockTurn | Promise<MockTurn>);

export function script(steps: Step[]): { name: string; seen: MockConversation[] } {
  const name = `test_loop_${++scriptCount}`;
  const seen: MockConversation[] = [];
  registerMockScript(name, (conversation) => {
    seen.push(conversation);
    const step = steps[Math.min(conversation.turn, steps.length) - 1]!;
    return typeof step === 'function' ? step(conversation) : step;
  });
  return { name, seen };
}

export function call(toolName: string, input: unknown = {}): MockTurn {
  return { toolCalls: [{ toolName, input }] };
}

export const hang: Step = () => new Promise<MockTurn>(() => {});

export function loopDeps(signal = new AbortController().signal): LoopDeps {
  return { signal, trace: createTraceRecorder(), llm: mockLlm, tracer: noopRunTracer };
}

export function createTestTools() {
  const ran: number[] = [];
  const lookup = defineReadTool({
    name: 'lookup',
    description: 'Look up an item by id.',
    input: z.object({ id: z.number().int().positive() }),
    run: ({ id }) => {
      if (id === 404)
        throw new ToolError('Item 404 not found. Use lookup with an id from the list.');
      ran.push(id);
      return { id, name: `item ${id}` };
    },
    summarize: (item) => item.name,
  });
  const finish = defineTerminalTool({
    name: 'finish',
    description: 'Submit the answer.',
    input: z.object({ answer: z.string().min(1) }),
  });
  return { ran, lookup, finish, tools: [lookup, finish] as const };
}

export async function waitForRun(api: Api, id: number): Promise<AgentRun> {
  for (let i = 0; i < 200; i++) {
    const res = await api.get(`/api/agents/runs/${id}`).expect(200);
    const run = agentRunSchema.parse(res.body);
    if (run.status !== 'running') return run;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Run ${id} is still running`);
}
