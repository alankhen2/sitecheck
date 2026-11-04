import {
  auditChangesSchema,
  auditEntitySchema,
  type AuditAction,
  type AuditChanges,
  type AuditEntity,
} from '@sitecheck/shared';
import type {
  AuditAction as DbAuditAction,
  Prisma,
  PrismaClient,
} from '../generated/prisma/client.js';
import type { Assert, Same } from '../lib/types.js';
import type { AuditRepository } from '../services/audit.service.js';

// Fails typecheck if the shared Zod enum and the Prisma enum drift apart.
export type AuditActionsMatch = Assert<Same<AuditAction, DbAuditAction>>;

/** Adds an entry inside the caller's transaction, so it is saved or undone with the change. */
export async function writeAuditEntry(
  tx: Prisma.TransactionClient,
  entry: {
    userId: string;
    entity: AuditEntity;
    entityId: string;
    action: AuditAction;
    changes: AuditChanges;
  },
): Promise<void> {
  await tx.auditLog.create({ data: entry, select: { id: true } });
}

export function createAuditRepository(prisma: PrismaClient): AuditRepository {
  return {
    async listForPlant(plantId, { skip, take }) {
      // REPEATABLE READ: all three statements see one snapshot, so total and rows agree.
      const { rows, total } = await prisma.$transaction(
        async (tx) => {
          const inspections = await tx.inspection.findMany({
            where: { plantId },
            select: { id: true },
          });
          const where: Prisma.AuditLogWhereInput = {
            OR: [
              { entity: 'Plant', entityId: plantId },
              { entity: 'Inspection', entityId: { in: inspections.map(({ id }) => id) } },
            ],
          };
          return {
            rows: await tx.auditLog.findMany({
              where,
              select: {
                id: true,
                entity: true,
                entityId: true,
                action: true,
                changes: true,
                createdAt: true,
                user: { select: { name: true } },
              },
              // `id` last as a tie-breaker, so pages never overlap or skip rows.
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              skip,
              take,
            }),
            total: await tx.auditLog.count({ where }),
          };
        },
        { isolationLevel: 'RepeatableRead' },
      );

      return {
        // entity and changes are plain text and JSON in the database, so they
        // are unknown until parsed.
        rows: rows.map(({ user, entity, changes, ...row }) => ({
          ...row,
          actorName: user.name,
          entity: auditEntitySchema.parse(entity),
          changes: auditChangesSchema.parse(changes),
        })),
        total,
      };
    },
  };
}
