import { userMessage } from '../lib/errors';
import { useSites } from '../sites/queries';
import { SiteTable } from '../sites/SiteTable';

export function SitesPage() {
  const sites = useSites();

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Sites</h1>

      {sites.isPending && (
        <p role="status" className="py-8 text-center text-slate-600">
          Loading sites…
        </p>
      )}

      {sites.isError && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          <p>Could not load sites. {userMessage(sites.error)}</p>
          <button
            type="button"
            onClick={() => void sites.refetch()}
            className="mt-3 rounded bg-red-800 px-3 py-1.5 text-sm text-white hover:bg-red-900"
          >
            Try again
          </button>
        </div>
      )}

      {sites.data &&
        (sites.data.length > 0 ? (
          <SiteTable sites={sites.data} />
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="text-slate-700">No sites yet.</p>
          </div>
        ))}
    </section>
  );
}
