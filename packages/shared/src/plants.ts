import { z } from 'zod';
import {
  atLeastOneField,
  atLeastOneFieldMessage,
  isoDateTimeSchema,
  paginatedSchema,
  paginationQuerySchema,
} from './common.js';

/** Mirrors the Prisma `PlantStatus` enum; the api typechecks that the two stay in sync. */
export const plantStatusSchema = z.enum(['ACTIVE', 'REPAIR', 'INACTIVE']);
export type PlantStatus = z.infer<typeof plantStatusSchema>;

export const plantSchema = z.object({
  id: z.uuid(),
  siteId: z.uuid(),
  siteName: z.string(),
  name: z.string(),
  type: z.string(),
  serialNumber: z.string(),
  status: plantStatusSchema,
  nextInspectionAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Plant = z.infer<typeof plantSchema>;

const plantFields = {
  siteId: z.uuid(),
  name: z.string().trim().min(1).max(120),
  type: z.string().trim().min(1).max(60),
  serialNumber: z.string().trim().min(1).max(60),
  status: plantStatusSchema,
  nextInspectionAt: isoDateTimeSchema.nullable(),
};

export const createPlantBodySchema = z.object({
  ...plantFields,
  status: plantFields.status.default('ACTIVE'),
  // A new plant often has no schedule until its first inspection.
  nextInspectionAt: plantFields.nextInspectionAt.default(null),
});
export type CreatePlantBody = z.infer<typeof createPlantBodySchema>;

export const updatePlantBodySchema = z
  .object(plantFields)
  .partial()
  .refine(atLeastOneField, atLeastOneFieldMessage);
export type UpdatePlantBody = z.infer<typeof updatePlantBodySchema>;

/** `name` A-Z, or `nextInspectionAt` soonest first (plants with no date last). */
export const plantSortSchema = z.enum(['name', 'nextInspectionAt']);
export type PlantSort = z.infer<typeof plantSortSchema>;

export const listPlantsQuerySchema = z.object({
  // Matches name, type or serial number, ignoring case. A blank search is no filter.
  q: z
    .string()
    .trim()
    .max(100)
    .transform((s) => (s === '' ? undefined : s))
    .optional(),
  // `?status=ACTIVE` arrives as a string, `?status=ACTIVE&status=REPAIR` as an array.
  status: z
    .union([plantStatusSchema, z.array(plantStatusSchema)])
    .transform((s) => [...new Set(Array.isArray(s) ? s : [s])])
    .optional(),
  siteId: z.uuid().optional(),
  sort: plantSortSchema.default('name'),
  ...paginationQuerySchema.shape,
});
export type ListPlantsQuery = z.infer<typeof listPlantsQuerySchema>;

export const plantPageSchema = paginatedSchema(plantSchema);
export type PlantPage = z.infer<typeof plantPageSchema>;
