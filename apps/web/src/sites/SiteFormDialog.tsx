import { zodResolver } from '@hookform/resolvers/zod';
import { createSiteBodySchema, type CreateSiteBody, type Site } from '@sitecheck/shared';
import { useForm } from 'react-hook-form';
import { Dialog } from '../components/Dialog';
import { userMessage } from '../lib/errors';
import { useCreateSite, useUpdateSite } from './queries';

interface Props {
  /** The site to edit; leave out to add a new one. */
  site?: Site;
  onClose: () => void;
}

const inputClass =
  'mt-1 w-full rounded border border-slate-300 px-3 py-2 focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-600/30';

/** Only the fields that differ from the saved site, so a PATCH sends what the user changed. */
function changedFields(site: Site, values: CreateSiteBody): Partial<CreateSiteBody> {
  const changes: Partial<CreateSiteBody> = {};
  if (values.name !== site.name) changes.name = values.name;
  if (values.address !== site.address) changes.address = values.address;
  if (values.isActive !== site.isActive) changes.isActive = values.isActive;
  return changes;
}

/** Add or edit a site (admin only; the page does not offer it to inspectors). */
export function SiteFormDialog({ site, onClose }: Props) {
  const create = useCreateSite();
  const update = useUpdateSite();
  const mutation = site ? update : create;

  // The same schema the API validates with. It also trims, so "  Quarry " is
  // saved (and compared below) as "Quarry".
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(createSiteBodySchema),
    defaultValues: {
      name: site?.name ?? '',
      address: site?.address ?? '',
      isActive: site?.isActive ?? true,
    },
  });

  const onSubmit = handleSubmit((values) => {
    if (!site) {
      create.mutate(values, { onSuccess: onClose });
      return;
    }
    const changes = changedFields(site, values);
    // Nothing changed: the API would refuse an empty PATCH, and there is nothing to save.
    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }
    update.mutate({ id: site.id, changes }, { onSuccess: onClose });
  });

  return (
    <Dialog title={site ? `Edit ${site.name}` : 'Add site'} onClose={onClose}>
      <form onSubmit={(event) => void onSubmit(event)} noValidate className="mt-4">
        {mutation.isError && (
          <p role="alert" className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-800">
            {userMessage(mutation.error)}
          </p>
        )}

        <label htmlFor="site-name" className="block text-sm font-medium text-slate-700">
          Name
        </label>
        <input
          id="site-name"
          autoFocus
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? 'site-name-error' : undefined}
          {...register('name')}
          className={inputClass}
        />
        {errors.name && (
          <p id="site-name-error" className="mt-1 text-sm text-red-700">
            Enter a name of up to 120 characters.
          </p>
        )}

        <label htmlFor="site-address" className="mt-4 block text-sm font-medium text-slate-700">
          Address
        </label>
        <input
          id="site-address"
          aria-invalid={errors.address ? true : undefined}
          aria-describedby={errors.address ? 'site-address-error' : undefined}
          {...register('address')}
          className={inputClass}
        />
        {errors.address && (
          <p id="site-address-error" className="mt-1 text-sm text-red-700">
            Enter an address of up to 300 characters.
          </p>
        )}

        <div className="mt-4 flex items-start gap-2">
          <input
            id="site-active"
            type="checkbox"
            aria-describedby="site-active-hint"
            {...register('isActive')}
            className="mt-1 size-4 accent-amber-700"
          />
          <div>
            <label htmlFor="site-active" className="text-sm font-medium text-slate-700">
              Active
            </label>
            <p id="site-active-hint" className="text-sm text-slate-500">
              New plants cannot be added to an inactive site.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-4 py-2 text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded bg-amber-700 px-4 py-2 font-medium text-white hover:bg-amber-800 disabled:opacity-60"
          >
            {mutation.isPending ? 'Saving…' : site ? 'Save changes' : 'Add site'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
