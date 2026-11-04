import type { Dashboard } from '@sitecheck/shared';
import { toPlant, type PlantRecord } from './plants.service.js';

/** "Due this week": the same 7 days the plant list uses for its "Due soon" badge. */
const DUE_SOON_DAYS = 7;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const LIST_LIMIT = 10;

interface DueList {
  rows: PlantRecord[];
  total: number;
}

export interface DashboardRepository {
  /**
   * Plants per status, and the plants that are overdue (before `now`) or due
   * soon (from `now` to `soonUntil`), most urgent first, at most `limit` of each.
   * Inactive plants count towards their status but are never due: nobody can
   * inspect them. All of it is read from one snapshot, so the numbers agree.
   */
  summary(window: { now: Date; soonUntil: Date; limit: number }): Promise<{
    counts: Partial<Record<PlantRecord['status'], number>>;
    overdue: DueList;
    dueSoon: DueList;
  }>;
}

const toDueList = ({ rows, total }: DueList) => ({ items: rows.map(toPlant), total });

export interface DashboardServiceDeps {
  dashboard: DashboardRepository;
  /** The clock, so tests can fix what "now" and "this week" mean. */
  now?: () => Date;
}

export function createDashboardService({
  dashboard,
  now = () => new Date(),
}: DashboardServiceDeps) {
  return {
    async summary(): Promise<Dashboard> {
      const moment = now();
      const { counts, overdue, dueSoon } = await dashboard.summary({
        now: moment,
        soonUntil: new Date(moment.getTime() + DUE_SOON_DAYS * DAY_IN_MS),
        limit: LIST_LIMIT,
      });
      return {
        counts: {
          ACTIVE: counts.ACTIVE ?? 0,
          REPAIR: counts.REPAIR ?? 0,
          INACTIVE: counts.INACTIVE ?? 0,
        },
        overdue: toDueList(overdue),
        dueSoon: toDueList(dueSoon),
      };
    },
  };
}

export type DashboardService = ReturnType<typeof createDashboardService>;
