import type { Plant } from '@sitecheck/shared';
import { Dialog } from '../components/Dialog';
import { hasErrorCode } from '../lib/api';
import { userMessage } from '../lib/errors';
import { useDeletePlant } from './queries';

interface Props {
  plant: Plant;
  onClose: () => void;
}

const buttonClass = 'rounded px-4 py-2 text-slate-700 hover:bg-slate-100';

/**
 * Confirms deleting a plant (admin only). A plant with inspection history is
 * kept for the record, and the API answers PLANT_HAS_INSPECTIONS; the list
 * does not know a plant's history in advance, so that answer turns this
 * dialog into an explanation of what to do instead.
 */
export function DeletePlantDialog({ plant, onClose }: Props) {
  const remove = useDeletePlant();

  if (hasErrorCode(remove.error, 'PLANT_HAS_INSPECTIONS')) {
    return (
      <Dialog title={`Cannot delete ${plant.name}`} onClose={onClose}>
        <p role="alert" className="mt-3 text-slate-700">
          This plant has inspection history, which is kept for the record. Set its status to
          Inactive instead.
        </p>
        <div className="mt-6 flex justify-end">
          <button type="button" data-autofocus onClick={onClose} className={buttonClass}>
            Close
          </button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title={`Delete ${plant.name}?`} onClose={onClose}>
      <p className="mt-3 text-slate-700">
        Serial number <span className="font-mono">{plant.serialNumber}</span> at {plant.siteName}.
        This cannot be undone.
      </p>
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
            remove.mutate(plant.id, { onSuccess: onClose });
          }}
          className="rounded bg-red-700 px-4 py-2 font-medium text-white hover:bg-red-800 disabled:opacity-60"
        >
          {remove.isPending ? 'Deleting…' : 'Delete plant'}
        </button>
      </div>
    </Dialog>
  );
}
