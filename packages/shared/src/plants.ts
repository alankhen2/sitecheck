import { z } from 'zod';
import { atLeastOneField, atLeastOneFieldMessage, isoDateTimeSchema } from './common.js';

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

export const listPlantsQuerySchema = z.object({
  siteId: z.uuid().optional(),
});
export type ListPlantsQuery = z.infer<typeof listPlantsQuerySchema>;
