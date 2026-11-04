import type { PlantStatus } from '@sitecheck/shared';
import type {
  Prisma,
  PrismaClient,
  PlantStatus as DbPlantStatus,
} from '../generated/prisma/client.js';
import { escapeLike } from '../lib/like.js';
import { isPrismaError, PrismaCode } from '../lib/prisma-errors.js';
import type { Assert, Same } from '../lib/types.js';
import { changesBetween, plantSnapshot } from '../services/audit.service.js';
import { InvalidReferenceError, NotFoundError } from '../services/errors.js';
import {
  PlantHasInspectionsError,
  SerialNumberTakenError,
  type PlantRecord,
  type PlantRepository,
} from '../services/plants.service.js';
import { writeAuditEntry } from './audit.js';

// Fails typecheck if the shared Zod enum and the Prisma enum drift apart.
export type PlantStatusesMatch = Assert<Same<PlantStatus, DbPlantStatus>>;

const select = {
  id: true,
  siteId: true,
  name: true,
  type: true,
  serialNumber: true,
  status: true,
  nextInspectionAt: true,
  createdAt: true,
  updatedAt: true,
  // A join in the same query, so a list of N plants is one round trip, not N + 1.
  site: { select: { name: true } },
} as const satisfies Prisma.PlantSelect;

type Row = Prisma.PlantGetPayload<{ select: typeof select }>;

const toRecord = ({ site, ...plant }: Row): PlantRecord => ({ ...plant, siteName: site.name });

export { select as plantSelect, toRecord as toPlantRecord };

/**
 * Locks the plant's row until the transaction ends, then reads it. What is read
 * stays true while the transaction decides and writes: a second change waits
 * here, so an audit entry's "from" value is always what the plant really held.
 * Prisma has no API for FOR UPDATE, and the id is a bound parameter here too.
 */
export async function lockPlant(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<PlantRecord | null> {
  await tx.$queryRaw`SELECT 1 FROM plants WHERE id = ${id}::uuid FOR UPDATE`;
  const row = await tx.plant.findUnique({ where: { id }, select });
  return row ? toRecord(row) : null;
}

/** Saves `changes` and, if they changed anything, the audit entry. Needs the lock and `before`. */
export async function updateLockedPlant(
  tx: Prisma.TransactionClient,
  before: PlantRecord,
  changes: Prisma.PlantUncheckedUpdateInput,
  actorId: string,
): Promise<PlantRecord> {
  const after = toRecord(
    await tx.plant.update({ where: { id: before.id }, data: changes, select }),
  );
  const auditChanges = changesBetween(plantSnapshot(before), plantSnapshot(after));
  if (Object.keys(auditChanges).length > 0) {
    await writeAuditEntry(tx, {
      userId: actorId,
      entity: 'Plant',
      entityId: before.id,
      action: 'UPDATE',
      changes: auditChanges,
    });
  }
  return after;
}

/** Translates constraint errors from a write into the service's domain errors. */
function mapWriteError(err: unknown): never {
  if (isPrismaError(err, PrismaCode.UniqueViolation)) throw new SerialNumberTakenError();
  if (isPrismaError(err, PrismaCode.ForeignKeyViolation)) {
    throw new InvalidReferenceError('Site does not exist');
  }
  if (isPrismaError(err, PrismaCode.RecordNotFound)) throw new NotFoundError('Plant');
  throw err;
}

export function createPlantRepository(prisma: PrismaClient): PlantRepository {
  return {
    async search({ q, status, siteId, sort, skip, take }) {
      const where: Prisma.PlantWhereInput = {};
      if (siteId !== undefined) where.siteId = siteId;
      if (status !== undefined) where.status = { in: status };
      if (q !== undefined) {
        // ILIKE '%q%' with q as a bound parameter. Wildcards in q are escaped so a
        // search for "100%" or "E_A" matches those characters literally.
        const contains = escapeLike(q);
        where.OR = [
          { name: { contains, mode: 'insensitive' } },
          { type: { contains, mode: 'insensitive' } },
          { serialNumber: { contains, mode: 'insensitive' } },
        ];
      }

      // `id` last as a tie-breaker: without a total order, rows with equal keys
      // can swap between queries and appear on two pages or on none.
      const orderBy: Prisma.PlantOrderByWithRelationInput[] =
        sort === 'name'
          ? [{ name: 'asc' }, { id: 'asc' }]
          : [{ nextInspectionAt: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }, { id: 'asc' }];

      // REPEATABLE READ: both statements see one snapshot. Under Postgres' default
      // READ COMMITTED, a plant added between them could make total and rows disagree.
      const [rows, total] = await prisma.$transaction(
        [
          prisma.plant.findMany({ where, select, orderBy, skip, take }),
          prisma.plant.count({ where }),
        ],
        { isolationLevel: 'RepeatableRead' },
      );
      return { rows: rows.map(toRecord), total };
    },

    async findById(id) {
      const row = await prisma.plant.findUnique({ where: { id }, select });
      return row ? toRecord(row) : null;
    },

    async findBySerialNumber(serialNumber) {
      const row = await prisma.plant.findUnique({ where: { serialNumber }, select });
      return row ? toRecord(row) : null;
    },

    countInspections(id) {
      return prisma.inspection.count({ where: { plantId: id } });
    },

    async create({ siteId, name, type, serialNumber, status, nextInspectionAt }, actorId) {
      // Columns listed explicitly: TypeScript lets an object with extra
      // properties (e.g. a whole PlantRecord) through, and Prisma rejects unknown fields.
      const data = { siteId, name, type, serialNumber, status, nextInspectionAt };
      try {
        return await prisma.$transaction(async (tx) => {
          const plant = toRecord(await tx.plant.create({ data, select }));
          await writeAuditEntry(tx, {
            userId: actorId,
            entity: 'Plant',
            entityId: plant.id,
            action: 'CREATE',
            changes: changesBetween(null, plantSnapshot(plant)),
          });
          return plant;
        });
      } catch (err) {
        mapWriteError(err);
      }
    },

    async update(id, changes, actorId) {
      try {
        return await prisma.$transaction(async (tx) => {
          const before = await lockPlant(tx, id);
          if (!before) throw new NotFoundError('Plant');
          return updateLockedPlant(tx, before, changes, actorId);
        });
      } catch (err) {
        mapWriteError(err);
      }
    },

    async delete(id, actorId) {
      await prisma.$transaction(async (tx) => {
        const before = await lockPlant(tx, id);
        if (!before) throw new NotFoundError('Plant');

        // One statement: DELETE ... WHERE id = $1 AND NOT EXISTS (inspections).
        // A plain delete would cascade to inspections saved after the service's check.
        const { count } = await tx.plant.deleteMany({
          where: { id, inspections: { none: {} } },
        });
        if (count === 0) throw new PlantHasInspectionsError();

        await writeAuditEntry(tx, {
          userId: actorId,
          entity: 'Plant',
          entityId: id,
          action: 'DELETE',
          changes: changesBetween(plantSnapshot(before), null),
        });
      });
    },
  };
}
