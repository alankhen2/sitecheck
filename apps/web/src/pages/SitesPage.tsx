import type { Site } from '@sitecheck/shared';
import { useState } from 'react';
import { useUser } from '../auth/user-context';
import { userMessage } from '../lib/errors';
import { useSites } from '../sites/queries';
import { SiteFormDialog } from '../sites/SiteFormDialog';
import { SiteTable } from '../sites/SiteTable';

/** Which dialog is open: none, the add form, or the edit form for one site. */
type OpenDialog = { kind: 'none' } | { kind: 'add' } | { kind: 'edit'; site: Site };

const none: OpenDialog = { kind: 'none' };

export function SitesPage() {
  const sites = useSites();
  // Hiding the buttons is for the user's sake; the API refuses inspectors anyway.
  const isAdmin = useUser().role === 'ADMIN';
  const [dialog, setDialog] = useState<OpenDialog>(none);
  const closeDialog = () => {
    setDialog(none);
  };

  const rowActions = (site: Site) => (
    <button
      type="button"
      aria-label={`Edit ${site.name}`}
      onClick={() => {
        setDialog({ kind: 'edit', site });
      }}
      className="rounded px-2 py-1 text-amber-700 hover:bg-amber-50"
    >
      Edit
    </button>
  );

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Sites</h1>
        {isAdmin && (
          <button
            type="button"
            onClick={() => {
              setDialog({ kind: 'add' });
            }}
            className="rounded bg-amber-700 px-4 py-2 font-medium text-white hover:bg-amber-800"
          >
            Add site
          </button>
        )}
      </div>

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
          <SiteTable sites={sites.data} {...(isAdmin && { actions: rowActions })} />
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="text-slate-700">No sites yet.</p>
          </div>
        ))}

      {dialog.kind === 'add' && <SiteFormDialog onClose={closeDialog} />}
      {dialog.kind === 'edit' && (
        // key: editing another site starts a fresh form, not the previous one's values.
        <SiteFormDialog key={dialog.site.id} site={dialog.site} onClose={closeDialog} />
      )}
    </section>
  );
}
