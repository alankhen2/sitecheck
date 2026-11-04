import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import type { DashboardRepository } from '../services/dashboard.service.js';
import { plantSelect, toPlantRecord } from './plants.js';

const mostUrgentFirst: Prisma.PlantOrderByWithRelationInput[] = [
  { nextInspectionAt: 'asc' },
  { name: 'asc' },
  { id: 'asc' },
];

export function createDashboardRepository(prisma: PrismaClient): DashboardRepository {
  return {
    async summary({ now, soonUntil, limit }) {
      const inspectable = { status: { not: 'INACTIVE' } } satisfies Prisma.PlantWhereInput;
      const overdue = { ...inspectable, nextInspectionAt: { lt: now } };
      const dueSoon = { ...inspectable, nextInspectionAt: { gte: now, lte: soonUntil } };
      const list = (where: Prisma.PlantWhereInput) =>
        prisma.plant.findMany({
          where,
          select: plantSelect,
          orderBy: mostUrgentFirst,
          take: limit,
        });

      // REPEATABLE READ: every statement sees one snapshot, so the numbers agree.
      const [groups, overdueRows, overdueTotal, dueSoonRows, dueSoonTotal] =
        await prisma.$transaction(
          [
            prisma.plant.groupBy({
              by: ['status'],
              _count: { _all: true },
              orderBy: { status: 'asc' },
            }),
            list(overdue),
            prisma.plant.count({ where: overdue }),
            list(dueSoon),
            prisma.plant.count({ where: dueSoon }),
          ],
          { isolationLevel: 'RepeatableRead' },
        );

      return {
        counts: Object.fromEntries(groups.map((group) => [group.status, group._count._all])),
        overdue: { rows: overdueRows.map(toPlantRecord), total: overdueTotal },
        dueSoon: { rows: dueSoonRows.map(toPlantRecord), total: dueSoonTotal },
      };
    },
  };
}
