import { z } from 'zod';
import { atLeastOneField, atLeastOneFieldMessage, isoDateTimeSchema } from './common.js';

export const siteSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  address: z.string(),
  isActive: z.boolean(),
  plantCount: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Site = z.infer<typeof siteSchema>;

// Field rules shared by create and update. Unknown keys (id, plantCount, ...)
// are stripped by z.object, so a client cannot set them.
const siteFields = {
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().min(1).max(300),
  isActive: z.boolean(),
};

export const createSiteBodySchema = z.object({
  ...siteFields,
  isActive: siteFields.isActive.default(true),
});
export type CreateSiteBody = z.infer<typeof createSiteBodySchema>;

// Built from the plain fields, not from createSiteBodySchema: a default there would
// silently set isActive back to true on every PATCH that does not mention it.
export const updateSiteBodySchema = z
  .object(siteFields)
  .partial()
  .refine(atLeastOneField, atLeastOneFieldMessage);
export type UpdateSiteBody = z.infer<typeof updateSiteBodySchema>;
