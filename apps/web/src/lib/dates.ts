const DAY_MS = 24 * 60 * 60 * 1000;

/** "5 Nov 2026", in the browser's time zone. */
const dateFormat = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

export type DueState = 'overdue' | 'soon' | 'later' | 'none';

/**
 * How urgent the next inspection is: past due, due within 7 days (the same
 * "this week" the dashboard will count), later, or not scheduled. `now` is a
 * parameter so tests do not depend on today's date.
 */
export function dueState(iso: string | null, now: Date = new Date()): DueState {
  if (iso === null) return 'none';
  const due = new Date(iso).getTime();
  if (due < now.getTime()) return 'overdue';
  if (due <= now.getTime() + 7 * DAY_MS) return 'soon';
  return 'later';
}
