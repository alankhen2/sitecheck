import { describe, expect, it } from 'vitest';
import { dueState, formatDate } from './dates';

const now = new Date('2026-11-03T10:00:00Z');

describe('dueState', () => {
  it.each([
    ['not scheduled', null, 'none'],
    ['yesterday', '2026-11-02T10:00:00Z', 'overdue'],
    ['one minute ago', '2026-11-03T09:59:00Z', 'overdue'],
    ['tomorrow', '2026-11-04T10:00:00Z', 'soon'],
    ['exactly 7 days ahead', '2026-11-10T10:00:00Z', 'soon'],
    ['8 days ahead', '2026-11-11T10:00:00Z', 'later'],
  ] as const)('%s → %s', (_label, iso, expected) => {
    expect(dueState(iso, now)).toBe(expected);
  });
});

describe('formatDate', () => {
  it('formats as day, short month and year', () => {
    // Midday UTC, so the calendar date is the same in every time zone a test runs in.
    expect(formatDate('2026-11-05T12:00:00Z')).toBe('5 Nov 2026');
  });
});
