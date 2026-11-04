import { zodResolver } from '@hookform/resolvers/zod';
import {
  CHECKLIST_ITEMS,
  inspectionCommentSchema,
  inspectionNotesSchema,
  type Plant,
} from '@sitecheck/shared';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { z } from 'zod';
import { userMessage } from '../lib/errors';
import { useRecordInspection } from './queries';

/**
 * What the form holds. Radio buttons give text, and no answer is allowed until
 * submit, so `passed` is not yet the API's boolean. The rule is checked per item,
 * not over the whole list as in the API's schema: an unanswered item then does
 * not hide the missing comment on another one.
 */
const inspectionFormSchema = z.object({
  items: z.array(
    z
      .object({
        label: z.enum(CHECKLIST_ITEMS),
        passed: z.enum(['true', 'false']),
        comment: inspectionCommentSchema,
      })
      .refine((item) => item.passed === 'true' || item.comment !== null, { path: ['comment'] }),
  ),
  notes: inspectionNotesSchema,
});

/** A field of one checklist item, in the path form React Hook Form's types expect. */
const itemPath = <Field extends 'label' | 'passed' | 'comment'>(index: number, field: Field) =>
  `items.${String(index)}.${field}` as `items.${number}.${Field}`;

const inputClass = 'mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2';
const radioClass =
  'flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded border border-slate-300 bg-white px-4 sm:flex-none';

/** The checklist for one plant. Saving goes back to the plant, which shows the outcome. */
export function InspectionForm({ plant }: { plant: Plant }) {
  const record = useRecordInspection(plant.id);
  const navigate = useNavigate();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(inspectionFormSchema),
    defaultValues: {
      // No answer chosen: an item nobody looked at must not count as a pass.
      items: CHECKLIST_ITEMS.map((label) => ({ label, comment: '' })),
      notes: '',
    },
  });
  const answers = useWatch({ control, name: 'items' });

  const onSubmit = handleSubmit(({ items, notes }) => {
    record.mutate(
      {
        notes,
        items: items.map(({ label, passed, comment }) => ({
          label,
          passed: passed === 'true',
          comment,
        })),
      },
      {
        // replace: Back from the plant should not reopen a form that was already saved.
        onSuccess: ({ result }) =>
          void navigate(`/plants/${plant.id}`, { replace: true, state: { inspected: result } }),
      },
    );
  });

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-4">
      {record.isError && (
        <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-800">
          {userMessage(record.error)}
        </p>
      )}

      <ul role="list" className="flex flex-col gap-3">
        {CHECKLIST_ITEMS.map((label, index) => {
          const failed = answers[index]?.passed === 'false';
          const itemErrors = errors.items?.[index];
          const answerErrorId = `item-${String(index)}-answer-error`;
          const commentErrorId = `item-${String(index)}-comment-error`;
          const commentId = `item-${String(index)}-comment`;
          const titleId = `item-${String(index)}-title`;
          return (
            <li key={label} className="rounded-lg border border-slate-200 bg-white p-4">
              <input type="hidden" {...register(itemPath(index, 'label'))} />
              <div
                role="radiogroup"
                aria-labelledby={titleId}
                aria-required
                aria-invalid={itemErrors?.passed ? true : undefined}
                aria-describedby={itemErrors?.passed ? answerErrorId : undefined}
              >
                <p id={titleId} className="font-medium text-slate-900">
                  {label}
                </p>
                <div className="mt-2 flex gap-2">
                  <label
                    className={`${radioClass} has-checked:border-emerald-700 has-checked:bg-emerald-50`}
                  >
                    <input type="radio" value="true" {...register(itemPath(index, 'passed'))} />
                    Pass
                  </label>
                  <label
                    className={`${radioClass} has-checked:border-red-700 has-checked:bg-red-50`}
                  >
                    <input type="radio" value="false" {...register(itemPath(index, 'passed'))} />
                    Fail
                  </label>
                </div>
                {itemErrors?.passed && (
                  <p id={answerErrorId} className="mt-1 text-sm text-red-700">
                    Choose Pass or Fail.
                  </p>
                )}
              </div>

              <label htmlFor={commentId} className="mt-3 block text-sm font-medium text-slate-700">
                Comment <span className="sr-only">on {label} </span>
                {failed ? '(required for a fail)' : '(optional)'}
              </label>
              <input
                id={commentId}
                aria-required={failed}
                aria-invalid={itemErrors?.comment ? true : undefined}
                aria-describedby={itemErrors?.comment ? commentErrorId : undefined}
                {...register(itemPath(index, 'comment'))}
                className={inputClass}
              />
              {itemErrors?.comment && (
                <p id={commentErrorId} className="mt-1 text-sm text-red-700">
                  {itemErrors.comment.type === 'custom'
                    ? 'Say what is wrong.'
                    : 'Keep the comment to 500 characters.'}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <div>
        <label htmlFor="inspection-notes" className="block text-sm font-medium text-slate-700">
          Notes (optional)
        </label>
        <textarea
          id="inspection-notes"
          rows={3}
          aria-invalid={errors.notes ? true : undefined}
          aria-describedby={errors.notes ? 'inspection-notes-error' : undefined}
          {...register('notes')}
          className={inputClass}
        />
        {errors.notes && (
          <p id="inspection-notes-error" className="mt-1 text-sm text-red-700">
            Keep the notes to 2,000 characters.
          </p>
        )}
      </div>

      <p className="text-sm text-slate-600">
        A saved inspection cannot be changed. If one item fails, the inspection fails and this plant
        goes into Repair.
      </p>

      <div className="flex justify-end gap-2">
        <Link
          to={`/plants/${plant.id}`}
          className="rounded px-4 py-2 text-slate-700 hover:bg-slate-100"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={record.isPending}
          className="rounded bg-amber-700 px-4 py-2 font-medium text-white hover:bg-amber-800 disabled:opacity-60"
        >
          {record.isPending ? 'Saving…' : 'Save inspection'}
        </button>
      </div>
    </form>
  );
}
