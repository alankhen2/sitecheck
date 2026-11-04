import { dashboardSchema, plantStatusSchema, type Dashboard } from '@sitecheck/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { apiFetch } from '../lib/api';
import { userMessage } from '../lib/errors';
import { usePageHeading } from '../lib/usePageHeading';
import { plantKeys } from '../plants/keys';
import { statusLabel } from '../plants/labels';
import { NextInspection } from '../plants/NextInspection';

function StatusCounts({ counts }: { counts: Dashboard['counts'] }) {
  return (
    <ul role="list" aria-label="Plants by status" className="grid grid-cols-3 gap-3">
      {plantStatusSchema.options.map((status) => (
        <li key={status}>
          <Link
            to={`/plants?status=${status}`}
            className="block rounded-lg border border-slate-200 bg-white p-3 hover:border-slate-400 sm:p-4"
          >
            <span className="block text-2xl font-semibold text-slate-900 sm:text-3xl">
              {counts[status]}
            </span>{' '}
            <span className="block text-sm text-slate-600">
              {statusLabel[status]} <span className="sr-only">plants</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function DueList(props: { title: string; empty: string; list: Dashboard['overdue'] }) {
  const { title, empty, list } = props;
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">
        {title} <span className="font-normal text-slate-600">({list.total})</span>
      </h2>

      {list.items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-slate-700">
          {empty}
        </p>
      ) : (
        <ul
          role="list"
          className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-sm"
        >
          {list.items.map((plant) => (
            <li key={plant.id} className="px-4 py-3">
              <Link
                to={`/plants/${plant.id}`}
                className="font-medium break-words text-slate-900 underline decoration-slate-300 underline-offset-2"
              >
                {plant.name}
              </Link>
              <p className="mt-0.5 break-words text-slate-600">{plant.siteName}</p>
              <p className="mt-1">
                <NextInspection iso={plant.nextInspectionAt} />
              </p>
            </li>
          ))}
        </ul>
      )}

      {list.total > list.items.length && (
        <p className="text-sm text-slate-600">
          The {list.items.length} most urgent of {list.total}.{' '}
          <Link
            to="/plants?sort=nextInspectionAt"
            className="text-amber-700 underline underline-offset-2"
          >
            See all by date
          </Link>
        </p>
      )}
    </section>
  );
}

/** What needs attention: plants by status, and which inspections are late or coming up. */
export function DashboardPage() {
  const heading = usePageHeading('Dashboard');
  const dashboard = useQuery({
    // Under the plant keys: any plant change or inspection refreshes it too.
    queryKey: plantKeys.dashboard,
    queryFn: ({ signal }) => apiFetch('/dashboard', dashboardSchema, { signal }),
  });

  return (
    <section className="flex flex-col gap-6">
      <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold outline-none">
        Dashboard
      </h1>

      {dashboard.isPending && (
        <p role="status" className="py-8 text-center text-slate-600">
          Loading dashboard…
        </p>
      )}

      {dashboard.isError && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          <p>Could not load the dashboard. {userMessage(dashboard.error)}</p>
          <button
            type="button"
            onClick={() => void dashboard.refetch()}
            className="mt-3 rounded bg-red-800 px-3 py-1.5 text-sm text-white hover:bg-red-900"
          >
            Try again
          </button>
        </div>
      )}

      {dashboard.data && (
        <>
          <StatusCounts counts={dashboard.data.counts} />
          <div className="grid gap-6 md:grid-cols-2">
            <DueList title="Overdue" empty="Nothing is overdue." list={dashboard.data.overdue} />
            <DueList
              title="Due in the next 7 days"
              empty="Nothing is due in the next 7 days."
              list={dashboard.data.dueSoon}
            />
          </div>
        </>
      )}
    </section>
  );
}
