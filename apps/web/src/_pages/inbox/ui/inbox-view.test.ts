import type { Settings } from '@postdog/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SWRConfig } from 'swr';
import { describe, expect, it } from 'vitest';
import { notificationKeys } from '@/entities/notification';
import { settingsKey } from '@/entities/settings';
import { ApiError } from '@/shared/api';
import { InboxView } from './inbox-view';

function render(aiEnabled: boolean): string {
  const settings: Settings = { aiEnabled, decompositionMode: 'auto', scheduledRunsEnabled: true };
  const empty = { items: [], unreadCount: 3 };
  return renderToStaticMarkup(
    createElement(
      SWRConfig,
      {
        value: {
          provider: () => new Map(),
          fallback: {
            [settingsKey]: settings,
            [notificationKeys.list()]: empty,
            [notificationKeys.unreadCount()]: empty,
          },
        },
      },
      createElement(InboxView),
    ),
  );
}

describe('Inbox page', () => {
  it('shows the notifications and the unread count while AI is on', () => {
    const html = render(true);
    expect(html).toContain('Nothing needs you right now');
    expect(html).toContain('aria-label="3 unread"');
  });

  it('replaces the Inbox with a link to Settings while AI is off', () => {
    const html = render(false);
    expect(html).toContain('AI is turned off');
    expect(html).toContain('href="/settings"');
    expect(html).not.toContain('Nothing needs you');
    expect(html).not.toContain('unread');
  });

  it("says the Inbox didn't load and offers Try again when the settings fail", () => {
    const error = new ApiError(0, 'network_error', "Postdog can't reach the API.");
    const html = renderToStaticMarkup(
      createElement(
        SWRConfig,
        { value: { provider: () => new Map([[settingsKey, { error }]]) } },
        createElement(InboxView),
      ),
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('The Inbox didn&#x27;t load');
    expect(html).toMatch(/<button[^>]*>(Try again|Trying again…)<\/button>/);
  });
});
