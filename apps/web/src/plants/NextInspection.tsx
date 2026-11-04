import { dueState, formatDate } from '../lib/dates';

/** The next inspection date, with "Overdue" or "Due soon" spelled out (not only coloured). */
export function NextInspection({ iso }: { iso: string | null }) {
  const state = dueState(iso);
  if (iso === null || state === 'none') {
    return <span className="text-slate-500">Not scheduled</span>;
  }
  return (
    // Wraps as a whole: the badge drops below the date on a narrow card.
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <time dateTime={iso} className="whitespace-nowrap">
        {formatDate(iso)}
      </time>
      {state === 'overdue' && (
        <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-red-800">
          Overdue
        </span>
      )}
      {state === 'soon' && (
        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-amber-800">
          Due soon
        </span>
      )}
    </span>
  );
}
