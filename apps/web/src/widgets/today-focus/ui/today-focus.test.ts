import type { AgentRunSummary, Settings } from '@postdog/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SWRConfig } from 'swr';
import { describe, expect, it } from 'vitest';
import { agentRunKeys } from '@/entities/agent-run';
import { settingsKey } from '@/entities/settings';
import { TodayFocus } from '../index';

const plannerRun: AgentRunSummary = {
  id: 5,
  agent: 'planner',
  mode: null,
  status: 'running',
  trigger: 'manual',
  promptVersion: 'V1',
  error: null,
  langfuseTraceId: null,
  usage: null,
  llm: { mode: 'real', model: 'claude' },
  startedAt: 1,
  finishedAt: null,
  label: 'Plan my day',
};

function render(running: AgentRunSummary[]): string {
  const settings: Settings = {
    aiEnabled: true,
    decompositionMode: 'suggest',
    scheduledRunsEnabled: true,
  };
  return renderToStaticMarkup(
    createElement(
      SWRConfig,
      {
        value: {
          provider: () => new Map(),
          fallback: {
            [settingsKey]: settings,
            [agentRunKeys.plannerLatest]: { latest: null },
            [agentRunKeys.running()]: { items: running },
          },
        },
      },
      createElement(TodayFocus),
    ),
  );
}

describe('TodayFocus while a Planner run goes on elsewhere', () => {
  it('disables planning and links to the run', () => {
    const html = render([plannerRun]);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*Planning your day…<\/button>/);
    expect(html).toContain('href="/runs?run=5"');
    expect(html).not.toContain('>Plan my day</button>');
  });

  it('offers Plan my day when no Planner run is going', () => {
    const decomposer = { ...plannerRun, id: 6, agent: 'decomposer' as const, label: 'x' };
    const html = render([decomposer]);
    expect(html).toContain('Plan my day');
    expect(html).not.toContain('Planning your day…');
    expect(html).not.toContain('/runs?run=');
  });
});
