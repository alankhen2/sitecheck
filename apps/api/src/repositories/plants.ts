import type { PlantStatus } from '@sitecheck/shared';
import type {
  Prisma,
  PrismaClient,
  PlantStatus as DbPlantStatus,
} from '../generated/prisma/client.js';
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
    async list(filter) {
      const rows = await prisma.plant.findMany({ where: filter, select, orderBy: { name: 'asc' } });
      return rows.map(toRecord);
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
