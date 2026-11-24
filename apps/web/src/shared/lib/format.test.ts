import { describe, expect, it } from 'vitest';
import { formatElapsed, formatRelativeTime } from './format';

const now = new Date(2026, 10, 22, 15, 0).getTime();
const minutes = (count: number) => now - count * 60_000;

describe('formatRelativeTime', () => {
  it('reads recent times in minutes', () => {
    expect(formatRelativeTime(now - 5_000, now)).toBe('just now');
    expect(formatRelativeTime(minutes(5), now)).toBe('5 min ago');
  });

  it('reads earlier today in hours', () => {
    expect(formatRelativeTime(minutes(180), now)).toBe('3 h ago');
  });

  it('reads yesterday, then the date', () => {
    expect(formatRelativeTime(new Date(2026, 10, 21, 23, 0).getTime(), now)).toBe('yesterday');
    expect(formatRelativeTime(new Date(2026, 10, 12, 9, 0).getTime(), now)).toBe('Nov 12');
  });
});

describe('formatElapsed', () => {
  it('reads seconds, then minutes, then hours', () => {
    expect(formatElapsed(300)).toBe('under 1 s');
    expect(formatElapsed(42_400)).toBe('42 s');
    expect(formatElapsed(59_600)).toBe('1 min');
    expect(formatElapsed(185_000)).toBe('3 min 5 s');
    expect(formatElapsed(3_840_000)).toBe('1 h 4 min');
  });
});
