import { Link, useParams } from 'react-router';
import { InspectionForm } from '../inspections/InspectionForm';
import { userMessage } from '../lib/errors';
import { usePageHeading } from '../lib/usePageHeading';
import { isPlantNotFound, usePlant } from '../plants/queries';

export function InspectPage() {
  const { id = '' } = useParams();
  const plant = usePlant(id);
  const notFound = isPlantNotFound(plant.error);
  const title = plant.data
    ? `Inspect ${plant.data.name}`
    : notFound
      ? 'Plant not found'
      : 'Inspect plant';
  const heading = usePageHeading(title);

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <Link
          to={plant.data ? `/plants/${plant.data.id}` : '/plants'}
          className="text-sm text-amber-700 underline underline-offset-2"
        >
          {plant.data ? 'Back to plant' : 'All plants'}
        </Link>
        <h1
          ref={heading}
          tabIndex={-1}
          className="mt-2 text-2xl font-semibold break-words outline-none"
        >
          {title}
        </h1>
        {plant.data && (
          <p className="mt-1 text-sm text-slate-600">
            <span className="font-mono text-xs">{plant.data.serialNumber}</span> at{' '}
            {plant.data.siteName}
          </p>
        )}
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

      {plant.data &&
        (plant.data.status === 'INACTIVE' ? (
          <p role="alert" className="rounded bg-slate-100 px-3 py-2 text-slate-800">
            This plant is inactive, so it cannot be inspected.
          </p>
        ) : (
          <InspectionForm plant={plant.data} />
        ))}
    </section>
  );
}
