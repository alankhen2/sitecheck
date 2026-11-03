import type { Plant, PlantPage } from '@sitecheck/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { Pagination } from '../components/Pagination';
import { userMessage } from '../lib/errors';
import { PlantFilters } from '../plants/PlantFilters';
import { PlantFormDialog } from '../plants/PlantFormDialog';
import { PlantTable } from '../plants/PlantTable';
import { usePlants } from '../plants/queries';
import { hasFilters } from '../plants/search-params';
import { usePlantQuery } from '../plants/usePlantQuery';
import { useSites } from '../sites/queries';

/** Which dialog is open: none, the add form, or the edit form for one plant. */
type OpenDialog = { kind: 'none' } | { kind: 'add' } | { kind: 'edit'; plant: Plant };

const none: OpenDialog = { kind: 'none' };

function resultSummary({ page, pageSize, total }: PlantPage): string {
  if (total === 0) return 'No plants';
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  return first > total
    ? `${String(total)} plants`
    : `Showing ${String(first)}–${String(last)} of ${String(total)} plants`;
}

export function PlantsPage() {
  const [query, update] = usePlantQuery();
  const plants = usePlants(query);
  const filtered = hasFilters(query);
  // Admins and inspectors (every role) may add and edit plants.
  const [dialog, setDialog] = useState<OpenDialog>(none);
  const closeDialog = () => {
    setDialog(none);
  };
  // Viewing one site's plants: a new plant most likely goes there, if it can.
  const sites = useSites();
  const filterSite = sites.data?.find((site) => site.id === query.siteId && site.isActive);

  const rowActions = (plant: Plant) => (
    <button
      type="button"
      aria-label={`Edit ${plant.name}`}
      onClick={() => {
        setDialog({ kind: 'edit', plant });
      }}
      className="rounded px-2 py-1 text-amber-700 hover:bg-amber-50"
    >
      Edit
    </button>
  );

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Plants</h1>
        <button
          type="button"
          onClick={() => {
            setDialog({ kind: 'add' });
          }}
          className="rounded bg-amber-700 px-4 py-2 font-medium text-white hover:bg-amber-800"
        >
          Add plant
        </button>
      </div>

      <PlantFilters query={query} onChange={update} />

      {plants.isPending && (
        <p role="status" className="py-8 text-center text-slate-600">
          Loading plants…
        </p>
      )}

      {plants.isError && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          <p>Could not load plants. {userMessage(plants.error)}</p>
          <button
            type="button"
            onClick={() => void plants.refetch()}
            className="mt-3 rounded bg-red-800 px-3 py-1.5 text-sm text-white hover:bg-red-900"
          >
            Try again
          </button>
        </div>
      )}

      {plants.data && (
        <>
          {/* Read out by screen readers whenever the result changes. */}
          <p aria-live="polite" className="text-sm text-slate-600">
            {resultSummary(plants.data)}
            {plants.isPlaceholderData && ' · Updating…'}
          </p>

          {plants.data.items.length > 0 ? (
            <PlantTable
              plants={plants.data.items}
              stale={plants.isPlaceholderData}
              actions={rowActions}
            />
          ) : (
            <EmptyState
              filtered={filtered}
              pastLastPage={plants.data.total > 0}
              onFirstPage={() => {
                update({ page: 1 });
              }}
            />
          )}

          <Pagination
            page={plants.data.page}
            totalPages={plants.data.totalPages}
            onPageChange={(page) => {
              update({ page });
            }}
          />
        </>
      )}

      {dialog.kind === 'add' && (
        <PlantFormDialog
          {...(filterSite && { defaultSiteId: filterSite.id })}
          onClose={closeDialog}
        />
      )}
      {dialog.kind === 'edit' && (
        <PlantFormDialog key={dialog.plant.id} plant={dialog.plant} onClose={closeDialog} />
      )}
    </section>
  );
}

function EmptyState(props: { filtered: boolean; pastLastPage: boolean; onFirstPage: () => void }) {
  const box = 'rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center';

  // e.g. an old bookmark to page 9 after plants were deleted.
  if (props.pastLastPage) {
    return (
      <div className={box}>
        <p className="text-slate-700">This page is empty.</p>
        <button type="button" onClick={props.onFirstPage} className="mt-3 text-amber-700 underline">
          Go to the first page
        </button>
      </div>
    );
  }

  if (props.filtered) {
    return (
      <div className={box}>
        <p className="text-slate-700">No plants match these filters.</p>
        <Link to="/plants" className="mt-3 inline-block text-amber-700 underline">
          Clear filters
        </Link>
      </div>
    );
  }

  return (
    <div className={box}>
      <p className="text-slate-700">No plants yet.</p>
    </div>
  );
}
