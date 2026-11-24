import type { Settings } from '@postdog/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SWRConfig } from 'swr';
import { describe, expect, it, vi } from 'vitest';
import { settingsKey } from '@/entities/settings';
import { parseOpenRunId, RunsView } from './runs-view';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('run=7'),
  useRouter: () => ({ push: () => {}, replace: () => {} }),
}));

function render(aiEnabled: boolean): string {
  const settings: Settings = {
    aiEnabled,
    decompositionMode: 'suggest',
    scheduledRunsEnabled: true,
  };
  return renderToStaticMarkup(
    createElement(
      SWRConfig,
      { value: { provider: () => new Map(), fallback: { [settingsKey]: settings } } },
      createElement(RunsView),
    ),
  );
}

describe('RunsView', () => {
  it('loads the runs while AI is on', () => {
    const html = render(true);
    expect(html).toContain('Loading runs');
    expect(html).not.toContain('AI is turned off');
  });

  it('explains itself and links to Settings while AI is off', () => {
    const html = render(false);
    expect(html).toContain('AI is turned off');
    expect(html).toContain('href="/settings"');
    expect(html).not.toContain('Loading runs');
  });
});

describe('parseOpenRunId', () => {
  it('reads a run id and ignores anything else', () => {
    expect(parseOpenRunId('7')).toBe(7);
    expect(parseOpenRunId(null)).toBeUndefined();
    expect(parseOpenRunId('')).toBeUndefined();
    expect(parseOpenRunId('abc')).toBeUndefined();
    expect(parseOpenRunId('-2')).toBeUndefined();
  });
});
