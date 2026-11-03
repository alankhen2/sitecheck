import type { PlantStatus } from '@sitecheck/shared';
import { statusLabel } from './labels';

const statusStyle: Record<PlantStatus, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20',
  REPAIR: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  INACTIVE: 'bg-slate-100 text-slate-700 ring-slate-500/20',
};

/** The status as text in a coloured pill; the word carries the meaning, not the colour. */
export function StatusBadge({ status }: { status: PlantStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusStyle[status]}`}
    >
      {statusLabel[status]}
    </span>
  );
}
