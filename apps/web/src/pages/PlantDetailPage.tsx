import { inspectionResultSchema, type Plant } from '@sitecheck/shared';
import { Link, useLocation, useParams } from 'react-router';
import { z } from 'zod';
import { InspectionHistory } from '../inspections/InspectionHistory';
import { formatDate } from '../lib/dates';
import { userMessage } from '../lib/errors';
import { usePageHeading } from '../lib/usePageHeading';
import { ChangeHistory } from '../plants/ChangeHistory';
import { statusLabel } from '../plants/labels';
import { NextInspection } from '../plants/NextInspection';
import { isPlantNotFound, usePlant } from '../plants/queries';
import { StatusBadge } from '../plants/StatusBadge';

/** What the inspection form leaves in the navigation state. Unknown until parsed. */
const arrivalSchema = z.object({ inspected: inspectionResultSchema });

const term = 'text-slate-500';

function InspectionOutcome({ plant, passed }: { plant: Plant; passed: boolean }) {
  const next = plant.nextInspectionAt;
  return (
    <p
      role="status"
      className={`rounded-lg border p-4 ${
        passed
          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
          : 'border-red-200 bg-red-50 text-red-900'
      }`}
    >
      Inspection {passed ? 'passed' : 'failed'}. Its status is now {statusLabel[plant.status]}
      {passed && next ? `, and its next inspection is on ${formatDate(next)}.` : '.'}
    </p>
  );
}

export function PlantDetailPage() {
  const { id = '' } = useParams();
  const plant = usePlant(id);
  const notFound = isPlantNotFound(plant.error);
  const heading = usePageHeading(plant.data?.name ?? (notFound ? 'Plant not found' : 'Plant'));
  const arrival = arrivalSchema.safeParse(useLocation().state);

  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link to="/plants" className="text-sm text-amber-700 underline underline-offset-2">
          All plants
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <h1
            ref={heading}
            tabIndex={-1}
            className="text-2xl font-semibold break-words outline-none"
          >
            {plant.data?.name ?? (notFound ? 'Plant not found' : 'Plant')}
          </h1>
          {plant.data && plant.data.status !== 'INACTIVE' && (
            <Link
              to={`/plants/${plant.data.id}/inspect`}
              className="rounded bg-amber-700 px-4 py-2 font-medium text-white hover:bg-amber-800"
            >
              Inspect
            </Link>
          )}
        </div>
      </div>

      {plant.isPending && (
        <p role="status" className="py-8 text-center text-slate-600">
          Loading plant…
        </p>
      )}

      {notFound && (
        <p className="text-slate-700">It may have been deleted, or the address is wrong.</p>
      )}

      {plant.isError && !notFound && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          <p>Could not load this plant. {userMessage(plant.error)}</p>
          <button
            type="button"
            onClick={() => void plant.refetch()}
            className="mt-3 rounded bg-red-800 px-3 py-1.5 text-sm text-white hover:bg-red-900"
          >
            Try again
          </button>
        </div>
      )}

      {plant.data && (
        <>
          {arrival.success && (
            <InspectionOutcome plant={plant.data} passed={arrival.data.inspected === 'PASS'} />
          )}

          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 rounded-lg border border-slate-200 bg-white p-4 text-sm">
            <dt className={term}>Status</dt>
            <dd>
              <StatusBadge status={plant.data.status} />
            </dd>
            <dt className={term}>Next inspection</dt>
            <dd>
              <NextInspection iso={plant.data.nextInspectionAt} />
            </dd>
            <dt className={term}>Type</dt>
            <dd className="break-words">{plant.data.type}</dd>
            <dt className={term}>Serial number</dt>
            <dd className="font-mono text-xs break-all">{plant.data.serialNumber}</dd>
            <dt className={term}>Site</dt>
            <dd className="break-words">
              <Link
                to={`/plants?siteId=${plant.data.siteId}`}
                className="text-amber-700 underline underline-offset-2"
              >
                {plant.data.siteName}
              </Link>
            </dd>
          </dl>

          {plant.data.status === 'INACTIVE' && (
            <p className="text-sm text-slate-600">
              This plant is inactive, so it cannot be inspected. An admin or inspector can change
              its status from the plants list.
            </p>
          )}

          <InspectionHistory plantId={plant.data.id} />
          <ChangeHistory plantId={plant.data.id} />
        </>
      )}
    </section>
  );
}
