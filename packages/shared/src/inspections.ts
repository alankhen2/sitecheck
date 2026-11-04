import { z } from 'zod';
import { isoDateTimeSchema, paginatedSchema, paginationQuerySchema } from './common.js';

/**
 * What every inspection answers, in the order it is asked. Each inspection
 * stores its own copy of the labels, so rewording this list later does not
 * change what past inspections say.
 */
export const CHECKLIST_ITEMS = [
  'Structure and body',
  'Fluid levels and leaks',
  'Brakes and controls',
  'Lights and alarms',
  'Safety guards and emergency stop',
  'Tyres or tracks',
] as const;

/** Mirrors the Prisma `InspectionResult` enum; the api typechecks that the two stay in sync. */
export const inspectionResultSchema = z.enum(['PASS', 'FAIL']);
export type InspectionResult = z.infer<typeof inspectionResultSchema>;

export const inspectionItemSchema = z.object({
  label: z.string(),
  passed: z.boolean(),
  comment: z.string().nullable(),
});
export type InspectionItem = z.infer<typeof inspectionItemSchema>;

export const inspectionSchema = z.object({
  id: z.uuid(),
  plantId: z.uuid(),
  inspectorName: z.string(),
  result: inspectionResultSchema,
  notes: z.string().nullable(),
  inspectedAt: isoDateTimeSchema,
  items: z.array(inspectionItemSchema),
});
export type Inspection = z.infer<typeof inspectionSchema>;

/** Optional free text: a form's empty box and a missing value both become null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((text) => (text === '' ? null : text))
    .nullable()
    .default(null);

export const inspectionCommentSchema = optionalText(500);
export const inspectionNotesSchema = optionalText(2000);

/**
 * No `result`, inspector or date: the server works those out, so a client cannot
 * pass a failed checklist off as a pass, sign for someone else or backdate it.
 */
export const createInspectionBodySchema = z.object({
  items: z
    .array(
      z.object({
        label: z.enum(CHECKLIST_ITEMS),
        passed: z.boolean(),
        comment: inspectionCommentSchema,
      }),
    )
    .max(CHECKLIST_ITEMS.length)
    .superRefine((items, ctx) => {
      for (const label of CHECKLIST_ITEMS) {
        if (items.filter((item) => item.label === label).length !== 1) {
          ctx.addIssue({ code: 'custom', message: `Answer "${label}" exactly once` });
        }
      }
      items.forEach((item, index) => {
        if (!item.passed && item.comment === null) {
          ctx.addIssue({
            code: 'custom',
            message: 'Say what is wrong with a failed item',
            path: [index, 'comment'],
          });
        }
      });
    }),
  notes: inspectionNotesSchema,
});
export type CreateInspectionBody = z.infer<typeof createInspectionBodySchema>;

export const listInspectionsQuerySchema = paginationQuerySchema;
export type ListInspectionsQuery = z.infer<typeof listInspectionsQuerySchema>;

export const inspectionPageSchema = paginatedSchema(inspectionSchema);
export type InspectionPage = z.infer<typeof inspectionPageSchema>;
