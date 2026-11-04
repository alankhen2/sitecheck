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

const dateTimeFormat = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** "4 Nov 2026, 12:30 pm", in the browser's time zone. */
export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
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

/*
 * <input type="datetime-local"> works in "wall clock" text without a time
 * zone: "2026-11-05T09:30" means 9:30 where the user is. The API stores an
 * exact moment as ISO 8601 with an offset. These two convert between them in
 * the browser's time zone, so an inspector in Perth and an admin in Sydney
 * each see the moment in their own local time.
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** An ISO moment as the value of a datetime-local input, in local time; '' for none. */
export function toDateTimeLocal(iso: string | null): string {
  if (iso === null) return '';
  const d = new Date(iso);
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * A datetime-local value as an ISO moment in UTC; null for an empty input.
 * `new Date("YYYY-MM-DDTHH:mm")` (no offset) is read as local time by the
 * JavaScript spec, which is exactly what the input means.
 */
export function fromDateTimeLocal(value: string): string | null {
  if (value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Not a datetime-local value: ${value}`);
  return date.toISOString();
}
