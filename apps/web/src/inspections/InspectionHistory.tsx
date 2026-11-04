import type { Inspection, Plant } from '@sitecheck/shared';
import { Pagination } from '../components/Pagination';
import { formatDate } from '../lib/dates';
import { userMessage } from '../lib/errors';
import { usePageParam } from '../lib/usePageParam';
import { useInspections } from './queries';

/** Passed or failed, as a word in a pill (the word carries the meaning, not the colour). */
function ResultBadge({ result }: { result: Inspection['result'] }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
        result === 'PASS'
          ? 'bg-emerald-50 text-emerald-800 ring-emerald-600/20'
          : 'bg-red-50 text-red-800 ring-red-600/20'
      }`}
    >
      {result === 'PASS' ? 'Passed' : 'Failed'}
    </span>
  );
}

function InspectionCard({ inspection }: { inspection: Inspection }) {
  const failed = inspection.items.filter((item) => !item.passed);
  const date = formatDate(inspection.inspectedAt);

  return (
    <li className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="font-medium text-slate-900">
          <time dateTime={inspection.inspectedAt}>{date}</time>
        </h3>
        <ResultBadge result={inspection.result} />
        <span className="text-sm text-slate-600">by {inspection.inspectorName}</span>
      </div>

      {/* What went wrong is what people come here for, so it is not behind a click. */}
      {failed.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2 text-sm">
          {failed.map((item) => (
            <li key={item.label} className="rounded bg-red-50 px-3 py-2 break-words text-red-900">
              <span className="font-medium">{item.label}:</span> {item.comment}
            </li>
          ))}
        </ul>
      )}

      {inspection.notes && (
        <p className="mt-3 text-sm break-words whitespace-pre-line text-slate-700">
          {inspection.notes}
        </p>
      )}

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer py-1 text-slate-600">
          All {inspection.items.length} items
          <span className="sr-only"> of the inspection on {date}</span>
        </summary>
        <ul className="mt-2 flex flex-col gap-1">
          {inspection.items.map((item) => (
            <li key={item.label} className="break-words">
              <span className={item.passed ? 'text-slate-700' : 'font-medium text-red-800'}>
                {item.passed ? 'Pass' : 'Fail'}
              </span>
              {' · '}
              {item.label}
              {item.comment && <span className="text-slate-600"> ({item.comment})</span>}
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}

/** A plant's past inspections, with the page number in the URL. */
export function InspectionHistory({ plantId }: { plantId: Plant['id'] }) {
  const [page, setPage] = usePageParam('page');
  const inspections = useInspections(plantId, page);

  return (
    <section aria-labelledby="history-title" className="flex flex-col gap-3">
      <h2 id="history-title" className="text-lg font-semibold">
        Inspection history
      </h2>

      {inspections.isPending && (
        <p role="status" className="py-4 text-slate-600">
          Loading inspections…
        </p>
      )}

      {inspections.isError && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          <p>Could not load the inspections. {userMessage(inspections.error)}</p>
          <button
            type="button"
            onClick={() => void inspections.refetch()}
            className="mt-3 rounded bg-red-800 px-3 py-1.5 text-sm text-white hover:bg-red-900"
          >
            Try again
          </button>
        </div>
      )}

      {inspections.data &&
        (inspections.data.items.length > 0 ? (
          <>
            <ul
              role="list"
              aria-label="Inspections"
              aria-busy={inspections.isPlaceholderData}
              className={`flex flex-col gap-3 transition-opacity ${
                inspections.isPlaceholderData ? 'opacity-60' : ''
              }`}
            >
              {inspections.data.items.map((inspection) => (
                <InspectionCard key={inspection.id} inspection={inspection} />
              ))}
            </ul>
            <Pagination
              label="Inspection history pages"
              page={inspections.data.page}
              totalPages={inspections.data.totalPages}
              onPageChange={setPage}
            />
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="text-slate-700">
              {inspections.data.total > 0 ? 'This page is empty.' : 'No inspections yet.'}
            </p>
          </div>
        ))}
    </section>
  );
}
