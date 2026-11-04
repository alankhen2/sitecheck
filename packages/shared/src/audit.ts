import { z } from 'zod';
import { isoDateTimeSchema, paginatedSchema, paginationQuerySchema } from './common.js';

export const auditEntitySchema = z.enum(['Plant', 'Inspection']);
export type AuditEntity = z.infer<typeof auditEntitySchema>;

/** Mirrors the Prisma `AuditAction` enum; the api typechecks that the two stay in sync. */
export const auditActionSchema = z.enum(['CREATE', 'UPDATE', 'DELETE']);
export type AuditAction = z.infer<typeof auditActionSchema>;

/** Field name -> its value before and after. Values are text, or null for "none". */
export const auditChangesSchema = z.record(
  z.string(),
  z.object({ from: z.string().nullable(), to: z.string().nullable() }),
);
export type AuditChanges = z.infer<typeof auditChangesSchema>;

export const auditEntrySchema = z.object({
  id: z.uuid(),
  entity: auditEntitySchema,
  entityId: z.uuid(),
  action: auditActionSchema,
  actorName: z.string(),
  changes: auditChangesSchema,
  createdAt: isoDateTimeSchema,
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

export const listAuditQuerySchema = paginationQuerySchema;
export type ListAuditQuery = z.infer<typeof listAuditQuerySchema>;

export const auditPageSchema = paginatedSchema(auditEntrySchema);
export type AuditPage = z.infer<typeof auditPageSchema>;
