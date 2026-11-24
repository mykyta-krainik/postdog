import type { StatusUpdate } from '@postdog/shared';
import { describe, expect, it } from 'vitest';
import { renderSlackText, type RenderFacts } from '../../src/agents/status-updater/output';

const facts = (id: number, overrides: Partial<RenderFacts> = {}): RenderFacts => ({
  id,
  status: 'in_progress',
  subtaskDone: 0,
  subtaskTotal: 0,
  daysInStatus: 1,
  isStale: false,
  openBlockers: [],
  ...overrides,
});

const empty: StatusUpdate = {
  tone: 'neutral',
  toneReason: 'Facts',
  headline: 'Steady progress',
  done: [],
  inProgress: [],
  blockers: [],
  next: [],
};

describe('renderSlackText', () => {
  it('puts blockers with their ask first, then done, in progress and next, with facts from the data', () => {
    const text = renderSlackText(
      {
        ...empty,
        tone: 'heads_up',
        headline: 'CI migration is stuck',
        blockers: [
          {
            taskId: 1,
            identifier: 'PD-1',
            text: 'Docker build needs a registry.',
            ask: 'Can infra create one today?',
          },
        ],
        done: [{ taskId: 2, identifier: 'PD-2', text: 'Fixed the flaky checkout test' }],
        inProgress: [{ taskId: 3, identifier: 'PD-3', text: 'Export button is next' }],
        next: ['Ship the export button', 'Review SSO metadata'],
      },
      [
        facts(1, { subtaskDone: 1, subtaskTotal: 3, daysInStatus: 12, isStale: true }),
        facts(2, { status: 'done', subtaskDone: 2, subtaskTotal: 2 }),
        facts(3, { subtaskDone: 1, subtaskTotal: 2 }),
      ],
    );
    expect(text).toBe(
      [
        '*CI migration is stuck* :warning:',
        '*Blocker:* PD-1 Docker build needs a registry (1/3 subtasks done, in progress for 12 days). *Ask:* Can infra create one today?',
        '*Done:* PD-2 Fixed the flaky checkout test',
        '*In progress:* PD-3 Export button is next (1/2 subtasks done)',
        '*Next:* Ship the export button; Review SSO metadata',
      ].join('\n'),
    );
  });

  it('leaves out empty sections and adds no emoji to a neutral update', () => {
    const text = renderSlackText(
      {
        ...empty,
        inProgress: [{ taskId: 4, identifier: 'PD-4', text: 'Picked up the audit log' }],
      },
      [facts(4, { status: 'todo' })],
    );
    expect(text).toBe(
      '*Steady progress*\n*In progress:* PD-4 Picked up the audit log (not started)',
    );
  });

  it('names open blockers and gives each tone its single emoji', () => {
    const blocked = renderSlackText(
      {
        ...empty,
        tone: 'blocked',
        headline: 'Webhooks are blocked',
        blockers: [{ taskId: 5, identifier: 'PD-5', text: 'Waiting on staging keys' }],
      },
      [facts(5, { openBlockers: [{ id: 9, identifier: 'PD-9', title: 'Get keys' }] })],
    );
    expect(blocked).toBe(
      '*Webhooks are blocked* :rotating_light:\n*Blocker:* PD-5 Waiting on staging keys (blocked by PD-9)',
    );
    const celebrate = renderSlackText(
      { ...empty, tone: 'celebrate', done: [{ taskId: 2, identifier: 'PD-2', text: 'Done' }] },
      [facts(2, { status: 'done' })],
    );
    expect(celebrate.split('\n')[0]).toBe('*Steady progress* :tada:');
  });

  it('escapes the characters Slack treats as markup', () => {
    const text = renderSlackText(
      {
        ...empty,
        headline: 'Q&A <ready>',
        inProgress: [{ taskId: 6, identifier: 'PD-6', text: 'Limit < 100 & > 10' }],
      },
      [facts(6)],
    );
    expect(text).toBe('*Q&amp;A &lt;ready&gt;*\n*In progress:* PD-6 Limit &lt; 100 &amp; &gt; 10');
  });
});
