import type { Site } from '@sitecheck/shared';
import { Link } from 'react-router';
import { Dialog } from '../components/Dialog';
import { ApiError } from '../lib/api';
import { userMessage } from '../lib/errors';
import { useDeleteSite } from './queries';

interface Props {
  site: Site;
  onClose: () => void;
}

const buttonClass = 'rounded px-4 py-2 text-slate-700 hover:bg-slate-100';

/**
 * Confirms a delete. A site that still has plants cannot be deleted (the API
 * answers 409), so instead of a Delete button that is bound to fail, the
 * dialog says why and links to those plants. The count on screen can be out
 * of date (someone added a plant meanwhile), so a 409 gets the same answer.
 */
export function DeleteSiteDialog({ site, onClose }: Props) {
  const remove = useDeleteSite();
  const hasPlants =
    site.plantCount > 0 || (remove.error instanceof ApiError && remove.error.status === 409);

  if (hasPlants) {
    return (
      <Dialog title={`Cannot delete ${site.name}`} onClose={onClose}>
        <p role="alert" className="mt-3 text-slate-700">
          This site still has plants. Move them to another site or delete them first.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          <Link
            to={`/plants?siteId=${site.id}`}
            className="rounded px-4 py-2 text-amber-700 hover:bg-amber-50"
          >
            View its plants
          </Link>
          <button type="button" onClick={onClose} className={buttonClass}>
            Close
          </button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title={`Delete ${site.name}?`} onClose={onClose}>
      <p className="mt-3 text-slate-700">This cannot be undone.</p>
      {remove.isError && (
        <p role="alert" className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-800">
          {userMessage(remove.error)}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-2">
        {/* Cancel first: it gets the focus, so Enter does not delete by accident. */}
        <button type="button" data-autofocus onClick={onClose} className={buttonClass}>
          Cancel
        </button>
        <button
          type="button"
          disabled={remove.isPending}
          onClick={() => {
            remove.mutate(site.id, { onSuccess: onClose });
          }}
          className="rounded bg-red-700 px-4 py-2 font-medium text-white hover:bg-red-800 disabled:opacity-60"
        >
          {remove.isPending ? 'Deleting…' : 'Delete site'}
        </button>
      </div>
    </Dialog>
  );
}
