import { describe, expect, it } from 'vitest';
import { menuButtonLabel, navItemsFor, runningText } from './nav';

const labels = (aiEnabled: boolean) => navItemsFor(aiEnabled).map((item) => item.label);

describe('navItemsFor', () => {
  it('puts Today and Tasks first, then Runs and the Inbox, while AI is on', () => {
    expect(labels(true)).toEqual(['Today', 'Tasks', 'Runs', 'Inbox', 'Settings']);
  });

  it('hides Today, Runs and the Inbox while AI is off and keeps the tracker', () => {
    expect(labels(false)).toEqual(['Tasks', 'Settings']);
  });
});

describe('menuButtonLabel', () => {
  it('names what the dot on the menu button stands for', () => {
    expect(menuButtonLabel(undefined, 0)).toBe('Open menu');
    expect(menuButtonLabel(0, 0)).toBe('Open menu');
    expect(menuButtonLabel(2, 0)).toBe('Open menu, 2 unread');
    expect(menuButtonLabel(0, 1)).toBe('Open menu, 1 run running');
    expect(menuButtonLabel(2, 1)).toBe('Open menu, 2 unread, 1 run running');
  });

  it('counts runs in the plural', () => {
    expect(runningText(3)).toBe('3 runs running');
  });
});
