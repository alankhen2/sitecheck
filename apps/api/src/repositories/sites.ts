import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { isPrismaError, PrismaCode } from '../lib/prisma-errors.js';
import { NotFoundError } from '../services/errors.js';
import {
  SiteHasPlantsError,
  type SiteRecord,
  type SiteRepository,
} from '../services/sites.service.js';

const select = {
  id: true,
  name: true,
  address: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  // COUNT(*) of plants in the same query, not a second round trip.
  _count: { select: { plants: true } },
} as const satisfies Prisma.SiteSelect;

type Row = Prisma.SiteGetPayload<{ select: typeof select }>;

const toRecord = ({ _count, ...site }: Row): SiteRecord => ({ ...site, plantCount: _count.plants });

export function createSiteRepository(prisma: PrismaClient): SiteRepository {
  return {
    async list() {
      const rows = await prisma.site.findMany({ select, orderBy: { name: 'asc' } });
      return rows.map(toRecord);
    },

    async findById(id) {
      const row = await prisma.site.findUnique({ where: { id }, select });
      return row ? toRecord(row) : null;
    },

    async create(data) {
      return toRecord(await prisma.site.create({ data, select }));
    },

    async update(id, changes) {
      try {
        return toRecord(await prisma.site.update({ where: { id }, data: changes, select }));
      } catch (err) {
        if (isPrismaError(err, PrismaCode.RecordNotFound)) throw new NotFoundError('Site');
        throw err;
      }
    },

    async delete(id) {
      try {
        await prisma.site.delete({ where: { id } });
      } catch (err) {
        if (isPrismaError(err, PrismaCode.RecordNotFound)) throw new NotFoundError('Site');
        // onDelete: Restrict on Plant.site: a plant was added after the service checked.
        if (isPrismaError(err, PrismaCode.ForeignKeyViolation)) throw new SiteHasPlantsError();
        throw err;
      }
    },
  };
}
