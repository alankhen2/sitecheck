import { auditPageSchema, plantStatusSchema, type AuditEntry, type Plant } from '@sitecheck/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Pagination } from '../components/Pagination';
import { apiFetch } from '../lib/api';
import { formatDate, formatDateTime } from '../lib/dates';
import { userMessage } from '../lib/errors';
import { usePageParam } from '../lib/usePageParam';
import { plantKeys } from './keys';
import { statusLabel } from './labels';

const PAGE_SIZE = 10;

const fieldLabel: Record<string, string> = {
  name: 'Name',
  type: 'Type',
  serialNumber: 'Serial number',
  site: 'Site',
  status: 'Status',
  nextInspectionAt: 'Next inspection',
};

/** A stored value as people read it elsewhere in the app. */
function readable(field: string, value: string | null): string {
  if (value === null) return 'none';
  if (field === 'nextInspectionAt') return formatDate(value);
  if (field === 'status') {
    const status = plantStatusSchema.safeParse(value);
    if (status.success) return statusLabel[status.data];
  }
  return value;
}

/** One line per thing that happened. */
function describe({ entity, action, changes }: AuditEntry): string[] {
  if (entity === 'Inspection') {
    return [`Inspection recorded: ${changes.result?.to === 'PASS' ? 'passed' : 'failed'}`];
  }
  if (action === 'CREATE') return ['Plant added'];
  if (action === 'DELETE') return ['Plant deleted'];
  return Object.entries(changes).map(
    ([field, { from, to }]) =>
      `${fieldLabel[field] ?? field} changed from ${readable(field, from)} to ${readable(field, to)}`,
  );
}

/** Who changed what on this plant, newest first. */
export function ChangeHistory({ plantId }: { plantId: Plant['id'] }) {
  const [page, setPage] = usePageParam('changesPage');
  const history = useQuery({
    queryKey: plantKeys.history(plantId, page),
    queryFn: ({ signal }) =>
      apiFetch(
        `/plants/${plantId}/history?page=${String(page)}&pageSize=${String(PAGE_SIZE)}`,
        auditPageSchema,
        { signal },
      ),
    placeholderData: keepPreviousData,
  });

  return (
    <section aria-labelledby="changes-title" className="flex flex-col gap-3">
      <h2 id="changes-title" className="text-lg font-semibold">
        Change history
      </h2>

      {history.isPending && (
        <p role="status" className="py-4 text-slate-600">
          Loading changes…
        </p>
      )}

      {history.isError && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          <p>Could not load the changes. {userMessage(history.error)}</p>
          <button
            type="button"
            onClick={() => void history.refetch()}
            className="mt-3 rounded bg-red-800 px-3 py-1.5 text-sm text-white hover:bg-red-900"
          >
            Try again
          </button>
        </div>
      )}

      {history.data &&
        (history.data.items.length > 0 ? (
          <>
            <ul
              role="list"
              aria-label="Changes"
              aria-busy={history.isPlaceholderData}
              className={`divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-sm transition-opacity ${
                history.isPlaceholderData ? 'opacity-60' : ''
              }`}
            >
              {history.data.items.map((entry) => (
                <li key={entry.id} className="px-4 py-3">
                  <p className="text-slate-600">
                    <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>
                    {' · '}
                    {entry.actorName}
                  </p>
                  {describe(entry).map((line) => (
                    <p key={line} className="mt-1 break-words text-slate-900">
                      {line}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
            <Pagination
              label="Change history pages"
              page={history.data.page}
              totalPages={history.data.totalPages}
              onPageChange={setPage}
            />
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="text-slate-700">
              {history.data.total > 0 ? 'This page is empty.' : 'No changes recorded yet.'}
            </p>
          </div>
        ))}
    </section>
  );
}
