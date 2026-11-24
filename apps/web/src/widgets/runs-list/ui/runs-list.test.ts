import type { AgentRun, AgentRunSummary } from '@postdog/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SWRConfig } from 'swr';
import { describe, expect, it, vi } from 'vitest';
import { agentRunKeys } from '@/entities/agent-run';
import { ApiError } from '@/shared/api';
import { RunsList } from '../index';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => {}, replace: () => {} }),
}));

const now = Date.now();
const real = { mode: 'real', model: 'claude' } as const;

function summary(run: Partial<AgentRunSummary> & Pick<AgentRunSummary, 'id'>): AgentRunSummary {
  return {
    agent: 'planner',
    mode: null,
    status: 'completed',
    trigger: 'manual',
    promptVersion: 'V1',
    error: null,
    langfuseTraceId: null,
    usage: null,
    llm: real,
    startedAt: now - 300_000,
    finishedAt: now - 280_000,
    label: 'Plan my day',
    ...run,
  };
}

function full(run: AgentRunSummary, rest: Pick<AgentRun, 'input' | 'output'>): AgentRun {
  return { ...run, ...rest, trace: [] };
}

const planner = summary({ id: 6, trigger: 'scheduled' });
const running = summary({
  id: 9,
  agent: 'decomposer',
  status: 'running',
  finishedAt: null,
  label: 'Decompose to-do tasks',
  llm: { mode: 'mock', model: 'mock' },
});
const update = summary({ id: 8, agent: 'status_updater', label: 'Status update for PD-7' });
const notes = summary({ id: 7, agent: 'status_updater', label: 'My status update' });
const failed = summary({
  id: 5,
  agent: 'status_updater',
  status: 'failed',
  label: 'Status update for PD-7',
  error: { code: 'step_limit', message: 'It took 8 steps.' },
});
const cancelled = summary({
  id: 4,
  agent: 'decomposer',
  status: 'cancelled',
  label: 'Decompose 2 chosen tasks',
});
const decomposed = summary({ id: 3, agent: 'decomposer', label: 'Decompose to-do tasks' });

const details: Record<number, AgentRun> = {
  6: full(planner, {
    input: {},
    output: {
      focus: [
        {
          taskId: 12,
          identifier: 'PD-12',
          title: 'Rate limits',
          reason: 'It unblocks two tasks.',
          signals: [],
        },
      ],
      warnings: [{ message: 'PD-3 has been in progress for 9 days.' }],
      coordinationNotes: [],
    },
  }),
  9: full(running, { input: {}, output: null }),
  8: full(update, {
    input: { scope: 'task', taskId: 7 },
    output: {
      kind: 'update',
      update: {
        tone: 'heads_up',
        toneReason: 'One task is blocked.',
        headline: 'Login fix moves',
        done: [],
        inProgress: [],
        blockers: [],
        next: [],
      },
      warnings: [],
      text: '*PD-7* Login redirect: halfway there',
    },
  }),
  7: full(notes, {
    input: { scope: 'since' },
    output: {
      kind: 'needs_notes',
      tasks: [{ taskId: 14, identifier: 'PD-14', title: 'Docs pass' }],
      question: 'Where does the docs pass stand?',
    },
  }),
  5: full(failed, { input: { scope: 'task', taskId: 7 }, output: null }),
  4: full(cancelled, { input: { taskIds: [1, 2] }, output: null }),
  3: full(decomposed, {
    input: {},
    output: {
      tasks: [
        {
          taskId: 15,
          identifier: 'PD-15',
          title: 'Billing page',
          outcome: 'applied_subtasks',
          suggestionId: 2,
          detail: 'Created 3 subtasks',
        },
      ],
      related: [],
      changesetId: 11,
      counts: {
        considered: 1,
        suggestedSubtasks: 0,
        appliedSubtasks: 1,
        createdSubtasks: 3,
        needsClarification: 0,
        skipped: 0,
        duplicates: 0,
        claimed: 0,
        superseded: 0,
        failed: 0,
      },
      warnings: [],
    },
  }),
};

const runs = [running, update, notes, planner, failed, cancelled, decomposed];

function render(openRunId: number | undefined, items = runs): string {
  const cache = new Map<string, unknown>([
    [agentRunKeys.runs({ limit: 30 }), { data: { items } }],
    ...Object.values(details).map((run) => [agentRunKeys.run(run.id), { data: run }] as const),
    [agentRunKeys.run(404), { error: new ApiError(404, 'not_found', 'Agent run 404 not found') }],
  ]);
  return renderToStaticMarkup(
    createElement(
      SWRConfig,
      { value: { provider: () => cache as never } },
      createElement(RunsList, { openRunId }),
    ),
  );
}

describe('RunsList', () => {
  it('lists each run with its label, agent, status and timing', () => {
    const html = render(undefined);
    expect(html).toContain('Status update for PD-7');
    expect(html).toContain('Decompose 2 chosen tasks');
    expect(html).toContain('Status updater');
    for (const status of ['Running', 'Completed', 'Failed', 'Cancelled']) {
      expect(html).toContain(`aria-label="${status}"`);
    }
    expect(html).toContain('Started 5 min ago, still running');
    expect(html).toContain('Started 5 min ago, took 20 s');
    // Only the mock run carries the mark.
    expect(html.match(/Mock AI/g)).toHaveLength(1);
    // Only the scheduled plan carries this one, and it keeps its label.
    expect(html.match(/>Scheduled</g)).toHaveLength(1);
    expect(html).toMatch(
      /Plan my day<\/span><span[^>]*title="The daily schedule[^"]*"[^>]*>.*?Scheduled</,
    );
    expect(html).toContain('href="/runs?run=6"');
    expect(html).not.toContain('aria-expanded="true"');
  });

  it("shows a running run's progress with Cancel", () => {
    const html = render(9);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('Splitting tasks…');
    expect(html).toContain('>Cancel</button>');
  });

  it('shows a finished plan with links to its tasks and to Today', () => {
    const html = render(6);
    expect(html).toContain('href="/tasks?task=12"');
    expect(html).toContain('It unblocks two tasks.');
    expect(html).toContain('PD-3 has been in progress for 9 days.');
    expect(html).toContain('href="/today"');
    expect(html).toContain('How Postdog got here');
  });

  it('shows a finished status update as a draft to copy, without Regenerate', () => {
    const html = render(8);
    expect(html).toContain('*PD-7* Login redirect: halfway there</textarea>');
    expect(html).toContain('Postdog picked heads up: One task is blocked.');
    expect(html).toContain('Copy');
    expect(html).not.toContain('Regenerate');
  });

  it('shows a request for notes with links to the tasks', () => {
    const html = render(7);
    expect(html).toContain('Where does the docs pass stand?');
    expect(html).toContain('href="/tasks?task=14"');
    expect(html).not.toContain('<textarea');
  });

  it('shows a finished Decomposer run with its tasks and the Inbox link', () => {
    const html = render(3);
    expect(html).toContain('Looked at 1 task: 1 split into 3 subtasks.');
    expect(html).toContain('Review in Inbox');
    expect(html).toContain('href="/tasks?task=15"');
  });

  it('shows why a run failed and where to start it again, without Retry', () => {
    const html = render(5);
    expect(html).toContain('The agent hit its step limit. It took 8 steps.');
    expect(html).toContain('href="/tasks?task=7"');
    expect(html).toContain('Write it again from the task');
    expect(html).not.toContain('Retry');
  });

  it('shows a cancelled run without Run again', () => {
    const html = render(4);
    expect(html).toContain('You cancelled this run');
    expect(html).not.toContain('Run again');
    expect(html).toContain('Start again from Tasks');
  });

  it('says a run that does not exist is gone', () => {
    const html = render(404);
    expect(html).toContain('This run is gone');
    expect(html).toContain('href="/runs"');
  });

  it('points to the agents when there are no runs', () => {
    const html = render(undefined, []);
    expect(html).toContain('No runs yet');
    expect(html).toContain('href="/today"');
    expect(html).toContain('href="/tasks"');
  });
});
