import { plantStatusSchema, type ListPlantsQuery, type PlantStatus } from '@sitecheck/shared';
import { useSites } from '../sites/queries';
import { SearchBox } from './SearchBox';
import { statusLabel } from './labels';

interface Props {
  query: ListPlantsQuery;
  onChange: (changes: Partial<ListPlantsQuery>, options?: { replace?: boolean }) => void;
}

const select = 'min-w-0 flex-1 rounded border border-slate-300 bg-white px-3 py-2 md:flex-none';
// Full width on phones: a <select> is as wide as its longest site name otherwise.
const selectLabel = 'flex w-full items-center gap-2 text-sm text-slate-700 md:w-auto';

/** Search, site, sort and status controls. Every change goes straight to the URL. */
export function PlantFilters({ query, onChange }: Props) {
  const sites = useSites();
  const selected = new Set(query.status ?? []);

  const toggleStatus = (status: PlantStatus) => {
    const next = new Set(selected);
    if (next.has(status)) next.delete(status);
    else next.add(status);
    // Keep the enum's order, so the URL does not depend on click order.
    const ordered = plantStatusSchema.options.filter((s) => next.has(s));
    onChange({ status: ordered.length > 0 ? ordered : undefined });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <SearchBox
          value={query.q ?? ''}
          onSearch={(q) => {
            onChange({ q: q || undefined }, { replace: true });
          }}
        />

        <label className={selectLabel}>
          Site
          <select
            className={select}
            value={query.siteId ?? ''}
            disabled={sites.isPending}
            onChange={(event) => {
              onChange({ siteId: event.target.value || undefined });
            }}
          >
            <option value="">All sites</option>
            {sites.data?.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
                {site.isActive ? '' : ' (inactive)'}
              </option>
            ))}
          </select>
        </label>

        <label className={selectLabel}>
          Sort
          <select
            className={select}
            value={query.sort}
            onChange={(event) => {
              onChange({
                sort: event.target.value === 'nextInspectionAt' ? 'nextInspectionAt' : 'name',
              });
            }}
          >
            <option value="name">Name</option>
            <option value="nextInspectionAt">Next inspection</option>
          </select>
        </label>
      </div>

      <div role="group" aria-label="Status" className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-700">Status</span>
        {plantStatusSchema.options.map((status) => (
          <button
            key={status}
            type="button"
            aria-pressed={selected.has(status)}
            onClick={() => {
              toggleStatus(status);
            }}
            className={
              selected.has(status)
                ? 'rounded-full border border-amber-700 bg-amber-700 px-3 py-1 text-white'
                : 'rounded-full border border-slate-300 bg-white px-3 py-1 text-slate-700 hover:bg-slate-50'
            }
          >
            {statusLabel[status]}
          </button>
        ))}
      </div>
    </div>
  );
}
