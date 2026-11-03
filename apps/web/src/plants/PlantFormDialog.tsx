import { zodResolver } from '@hookform/resolvers/zod';
import {
  createPlantBodySchema,
  plantStatusSchema,
  type Plant,
  type UpdatePlantBody,
} from '@sitecheck/shared';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Dialog } from '../components/Dialog';
import { hasErrorCode } from '../lib/api';
import { fromDateTimeLocal, toDateTimeLocal } from '../lib/dates';
import { userMessage } from '../lib/errors';
import { useSites } from '../sites/queries';
import { statusLabel } from './labels';
import { useCreatePlant, useUpdatePlant } from './queries';

/** "2026-11-05T09:30", what a filled-in datetime-local input gives. */
const dateTimeLocalPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * The API's create schema, except the schedule: the form holds the input's
 * local text ('' for none), which is turned into an ISO moment on submit.
 */
const plantFormSchema = createPlantBodySchema.extend({
  status: plantStatusSchema,
  nextInspectionAt: z.string().regex(dateTimeLocalPattern).or(z.literal('')),
});
type PlantFormValues = z.infer<typeof plantFormSchema>;

const fieldNames = [
  'siteId',
  'name',
  'type',
  'serialNumber',
  'status',
  'nextInspectionAt',
] as const;

function initialValues(plant: Plant | undefined, defaultSiteId: string): PlantFormValues {
  return {
    siteId: plant?.siteId ?? defaultSiteId,
    name: plant?.name ?? '',
    type: plant?.type ?? '',
    serialNumber: plant?.serialNumber ?? '',
    status: plant?.status ?? 'ACTIVE',
    nextInspectionAt: toDateTimeLocal(plant?.nextInspectionAt ?? null),
  };
}

/** The fields that differ from what the form started with, ready to PATCH. */
function changedFields(initial: PlantFormValues, values: PlantFormValues): UpdatePlantBody {
  const changes: UpdatePlantBody = {};
  for (const field of fieldNames) {
    if (values[field] === initial[field]) continue;
    if (field === 'nextInspectionAt') changes.nextInspectionAt = fromDateTimeLocal(values[field]);
    else if (field === 'status') changes.status = values.status;
    else changes[field] = values[field];
  }
  return changes;
}

const fieldErrors: Record<(typeof fieldNames)[number], string> = {
  siteId: 'Choose a site.',
  name: 'Enter a name of up to 120 characters.',
  type: 'Enter a type of up to 60 characters.',
  serialNumber: 'Enter a serial number of up to 60 characters.',
  status: 'Choose a status.',
  nextInspectionAt: 'Enter a full date and time, or leave it empty.',
};

const inputClass =
  'mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-600/30';

interface Props {
  /** The plant to edit; leave out to add a new one. */
  plant?: Plant;
  /** Preselected site for a new plant, e.g. the site the list is filtered to. */
  defaultSiteId?: string;
  onClose: () => void;
}

/** Add or edit a plant (admins and inspectors). */
export function PlantFormDialog({ plant, defaultSiteId = '', onClose }: Props) {
  const sites = useSites();
  const create = useCreatePlant();
  const update = useUpdatePlant();
  const mutation = plant ? update : create;
  const initial = initialValues(plant, defaultSiteId);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({ resolver: zodResolver(plantFormSchema), defaultValues: initial });

  // A taken serial number belongs on its field, not in a banner at the top.
  const onError = (error: unknown) => {
    if (hasErrorCode(error, 'SERIAL_NUMBER_TAKEN')) {
      setError(
        'serialNumber',
        { type: 'server', message: 'Another plant already has this serial number.' },
        { shouldFocus: true },
      );
    }
  };
  const bannerError =
    mutation.isError && !hasErrorCode(mutation.error, 'SERIAL_NUMBER_TAKEN')
      ? userMessage(mutation.error)
      : null;

  const onSubmit = handleSubmit((values) => {
    if (!plant) {
      create.mutate(
        { ...values, nextInspectionAt: fromDateTimeLocal(values.nextInspectionAt) },
        { onSuccess: onClose, onError },
      );
      return;
    }
    const changes = changedFields(initial, values);
    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }
    update.mutate({ id: plant.id, changes }, { onSuccess: onClose, onError });
  });

  // New plants can only go to active sites (the API says 409 otherwise). A
  // plant already at an inactive site keeps it as an option, so that editing,
  // say, its status does not quietly move it somewhere else.
  const siteOptions = (sites.data ?? []).filter((s) => s.isActive || s.id === plant?.siteId);

  /** Props for a field's input: id, error state for screen readers, and RHF wiring. */
  const field = (name: (typeof fieldNames)[number], hintId?: string) => {
    const describedBy = [hintId, errors[name] && `plant-${name}-error`].filter(Boolean).join(' ');
    return {
      id: `plant-${name}`,
      'aria-invalid': errors[name] ? true : undefined,
      'aria-describedby': describedBy || undefined,
      ...register(name),
    };
  };
  const errorText = (name: (typeof fieldNames)[number]) =>
    errors[name] && (
      <p id={`plant-${name}-error`} className="mt-1 text-sm text-red-700">
        {errors[name].type === 'server' ? errors[name].message : fieldErrors[name]}
      </p>
    );
  const label = (name: (typeof fieldNames)[number], text: string) => (
    <label htmlFor={`plant-${name}`} className="mt-4 block text-sm font-medium text-slate-700">
      {text}
    </label>
  );

  return (
    <Dialog title={plant ? `Edit ${plant.name}` : 'Add plant'} onClose={onClose}>
      <form onSubmit={(event) => void onSubmit(event)} noValidate className="mt-2">
        {bannerError && (
          <p role="alert" className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-800">
            {bannerError}
          </p>
        )}

        {label('name', 'Name')}
        <input data-autofocus {...field('name')} className={inputClass} />
        {errorText('name')}

        {label('type', 'Type')}
        <input placeholder="e.g. Excavator" {...field('type')} className={inputClass} />
        {errorText('type')}

        {label('serialNumber', 'Serial number')}
        <input
          autoComplete="off"
          spellCheck={false}
          {...field('serialNumber')}
          className={`${inputClass} font-mono`}
        />
        {errorText('serialNumber')}

        {label('siteId', 'Site')}
        <select {...field('siteId')} disabled={sites.isPending} className={inputClass}>
          <option value="">{sites.isPending ? 'Loading sites…' : 'Choose a site'}</option>
          {siteOptions.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name}
              {site.isActive ? '' : ' (inactive)'}
            </option>
          ))}
        </select>
        {errorText('siteId')}

        {label('status', 'Status')}
        <select {...field('status')} className={inputClass}>
          {plantStatusSchema.options.map((status) => (
            <option key={status} value={status}>
              {statusLabel[status]}
            </option>
          ))}
        </select>
        {errorText('status')}

        {label('nextInspectionAt', 'Next inspection')}
        <input
          type="datetime-local"
          {...field('nextInspectionAt', 'plant-nextInspectionAt-hint')}
          className={inputClass}
        />
        <p id="plant-nextInspectionAt-hint" className="mt-1 text-sm text-slate-500">
          Your local time. Leave empty if not scheduled yet.
        </p>
        {errorText('nextInspectionAt')}

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
            {mutation.isPending ? 'Saving…' : plant ? 'Save changes' : 'Add plant'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
