import type { PlantStatus } from '@sitecheck/shared';
import type {
  Prisma,
  PrismaClient,
  PlantStatus as DbPlantStatus,
} from '../generated/prisma/client.js';
import { escapeLike } from '../lib/like.js';
import { isPrismaError, PrismaCode } from '../lib/prisma-errors.js';
import type { Assert, Same } from '../lib/types.js';
import { InvalidReferenceError, NotFoundError } from '../services/errors.js';
import {
  PlantHasInspectionsError,
  SerialNumberTakenError,
  type PlantRecord,
  type PlantRepository,
} from '../services/plants.service.js';

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

    async create({ siteId, name, type, serialNumber, status, nextInspectionAt }) {
      // Columns listed explicitly: TypeScript lets an object with extra
      // properties (e.g. a whole PlantRecord) through, and Prisma rejects unknown fields.
      const data = { siteId, name, type, serialNumber, status, nextInspectionAt };
      try {
        return toRecord(await prisma.plant.create({ data, select }));
      } catch (err) {
        mapWriteError(err);
      }
    },

    async update(id, changes) {
      try {
        return toRecord(await prisma.plant.update({ where: { id }, data: changes, select }));
      } catch (err) {
        mapWriteError(err);
      }
    },

    async delete(id) {
      // One statement: DELETE ... WHERE id = $1 AND NOT EXISTS (inspections).
      // A plain delete would cascade to inspections saved after the service's check.
      const { count } = await prisma.plant.deleteMany({
        where: { id, inspections: { none: {} } },
      });
      if (count === 1) return;

      const stillThere = await prisma.plant.findUnique({ where: { id }, select: { id: true } });
      throw stillThere ? new PlantHasInspectionsError() : new NotFoundError('Plant');
    },
  };
}
