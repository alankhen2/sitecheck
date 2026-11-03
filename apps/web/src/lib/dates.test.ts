import { describe, expect, it } from 'vitest';
import { dueState, formatDate, fromDateTimeLocal, toDateTimeLocal } from './dates';

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

// vitest.config.ts runs web tests in Australia/Sydney (UTC+11 in summer,
// UTC+10 in winter), so these hold on any machine and in CI (UTC).
describe('datetime-local conversion', () => {
  it('reads an input value as local time', () => {
    // 5 Nov is daylight saving time in Sydney: UTC+11.
    expect(fromDateTimeLocal('2026-11-05T09:30')).toBe('2026-11-04T22:30:00.000Z');
    // 5 Jul is standard time: UTC+10.
    expect(fromDateTimeLocal('2026-07-05T09:30')).toBe('2026-07-04T23:30:00.000Z');
  });

  it('shows a stored moment in local time', () => {
    expect(toDateTimeLocal('2026-11-04T22:30:00.000Z')).toBe('2026-11-05T09:30');
    expect(toDateTimeLocal('2026-07-04T23:30:00.000Z')).toBe('2026-07-05T09:30');
  });

  it('round-trips, so opening and saving a form changes nothing', () => {
    const stored = '2027-03-01T00:15:00.000Z';
    expect(fromDateTimeLocal(toDateTimeLocal(stored))).toBe(stored);
  });

  it('treats an empty input as "not scheduled"', () => {
    expect(fromDateTimeLocal('')).toBeNull();
    expect(toDateTimeLocal(null)).toBe('');
  });

  it('refuses text that is not a date instead of sending "Invalid Date"', () => {
    expect(() => fromDateTimeLocal('soon')).toThrow(RangeError);
  });
});
