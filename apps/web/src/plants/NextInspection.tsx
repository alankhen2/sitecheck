import { dueState, formatDate } from '../lib/dates';

/** The next inspection date, with "Overdue" or "Due soon" spelled out (not only coloured). */
export function NextInspection({ iso }: { iso: string | null }) {
  const state = dueState(iso);
  if (iso === null || state === 'none') {
    return <span className="text-slate-500">Not scheduled</span>;
  }
  return (
    <span className="whitespace-nowrap">
      <time dateTime={iso}>{formatDate(iso)}</time>
      {state === 'overdue' && (
        <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-800">
          Overdue
        </span>
      )}
      {state === 'soon' && (
        <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800">
          Due soon
        </span>
      )}
    </span>
  );
}
