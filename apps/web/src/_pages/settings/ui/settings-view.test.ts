import type { Settings } from '@postdog/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SWRConfig } from 'swr';
import { describe, expect, it } from 'vitest';
import { settingsKey } from '@/entities/settings';
import { SettingsView } from './settings-view';

function render(settings: Partial<Settings>): string {
  const loaded: Settings = {
    aiEnabled: true,
    decompositionMode: 'suggest',
    scheduledRunsEnabled: true,
    ...settings,
  };
  return renderToStaticMarkup(
    createElement(
      SWRConfig,
      { value: { provider: () => new Map(), fallback: { [settingsKey]: loaded } } },
      createElement(SettingsView),
    ),
  );
}

/** The switch that the row titled `title` labels. */
function switchOf(html: string, title: string): string {
  const id = new RegExp(`id="([^"]+)-title"[^>]*>${title}<`).exec(html)?.[1];
  expect(id, `a row titled ${title}`).toBeDefined();
  const button = new RegExp(`<button[^>]*aria-labelledby="${id}-title"[^>]*>`).exec(html)?.[0];
  expect(button, `the switch of ${title}`).toBeDefined();
  return button!;
}

const DESCRIPTION =
  'Plans your day at 8:00 and writes your status update at 18:00, in the server&#x27;s time zone. You can still run both yourself any time.';

/** The attribute, not the disabled: classes every switch carries. */
const DISABLED = 'disabled=""';

describe('Settings', () => {
  it('shows the Daily runs switch on, with when each run happens', () => {
    const html = render({});
    expect(html).toContain(DESCRIPTION);
    const daily = switchOf(html, 'Daily runs');
    expect(daily).toContain('aria-checked="true"');
    expect(daily).not.toContain(DISABLED);
    expect(html).not.toContain('Nothing runs while AI is off.');
    expect(html).toContain('Decomposition');
  });

  it('shows the Daily runs switch off once turned off', () => {
    const daily = switchOf(render({ scheduledRunsEnabled: false }), 'Daily runs');
    expect(daily).toContain('aria-checked="false"');
    expect(daily).not.toContain(DISABLED);
  });

  it('keeps the Daily runs switch while AI is off, disabled, and says nothing runs', () => {
    const html = render({ aiEnabled: false });
    const daily = switchOf(html, 'Daily runs');
    expect(daily).toContain('aria-checked="true"');
    expect(daily).toContain(DISABLED);
    expect(html).toContain('Nothing runs while AI is off.');
    expect(switchOf(html, 'AI features')).not.toContain(DISABLED);
    expect(html).not.toContain('Decomposition');
  });
});
