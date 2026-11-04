import type { InspectionResult } from '@sitecheck/shared';
import type {
  InspectionResult as DbInspectionResult,
  Prisma,
  PrismaClient,
} from '../generated/prisma/client.js';
import type { Assert, Same } from '../lib/types.js';
import { changesBetween, inspectionSnapshot } from '../services/audit.service.js';
import { NotFoundError } from '../services/errors.js';
import {
  PlantInactiveError,
  type InspectionRecord,
  type InspectionRepository,
} from '../services/inspections.service.js';
import { writeAuditEntry } from './audit.js';
import { lockPlant, updateLockedPlant } from './plants.js';

// Fails typecheck if the shared Zod enum and the Prisma enum drift apart.
export type InspectionResultsMatch = Assert<Same<InspectionResult, DbInspectionResult>>;

const select = {
  id: true,
  plantId: true,
  result: true,
  notes: true,
  inspectedAt: true,
  inspector: { select: { name: true } },
  items: {
    select: { label: true, passed: true, comment: true },
    orderBy: { position: 'asc' },
  },
} as const satisfies Prisma.InspectionSelect;

type Row = Prisma.InspectionGetPayload<{ select: typeof select }>;

const toRecord = ({ inspector, ...inspection }: Row): InspectionRecord => ({
  ...inspection,
  inspectorName: inspector.name,
});

export function createInspectionRepository(prisma: PrismaClient): InspectionRepository {
  return {
    async record({ plantId, inspectorId, result, notes, inspectedAt, items, plantChanges }) {
      const row = await prisma.$transaction(async (tx) => {
        // The plant first, under a lock, so it cannot be deleted or marked inactive
        // half way, and one marked inactive since the service's check is not
        // reactivated. Throwing rolls the transaction back.
        const plant = await lockPlant(tx, plantId);
        if (!plant) throw new NotFoundError('Plant');
        if (plant.status === 'INACTIVE') throw new PlantInactiveError();
        await updateLockedPlant(tx, plant, plantChanges, inspectorId);

        const inspection = await tx.inspection.create({
          data: {
            plantId,
            inspectorId,
            result,
            notes,
            inspectedAt,
            items: {
              create: items.map(({ position, label, passed, comment }) => ({
                position,
                label,
                passed,
                comment,
              })),
            },
          },
          select,
        });
        await writeAuditEntry(tx, {
          userId: inspectorId,
          entity: 'Inspection',
          entityId: inspection.id,
          action: 'CREATE',
          changes: changesBetween(null, inspectionSnapshot(result)),
        });
        return inspection;
      });
      return toRecord(row);
    },

    async listForPlant(plantId, { skip, take }) {
      const where = { plantId };
      // REPEATABLE READ: both statements see one snapshot, so total and rows agree.
      const [rows, total] = await prisma.$transaction(
        [
          prisma.inspection.findMany({
            where,
            select,
            // `id` last as a tie-breaker, so pages never overlap or skip rows.
            orderBy: [{ inspectedAt: 'desc' }, { id: 'desc' }],
            skip,
            take,
          }),
          prisma.inspection.count({ where }),
        ],
        { isolationLevel: 'RepeatableRead' },
      );
      return { rows: rows.map(toRecord), total };
    },
  };
}
