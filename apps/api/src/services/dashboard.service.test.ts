import { describe, expect, it } from 'vitest';
import { fakeDashboard, fakePlants, fakeSites, plantAt, testSites } from '../test-utils/fakes.js';
import { createDashboardService } from './dashboard.service.js';
import type { PlantRecord } from './plants.service.js';

const NOW = new Date('2026-11-04T00:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const inDays = (days: number) => new Date(NOW.getTime() + days * DAY);

function serviceFor(plants: PlantRecord[]) {
  const store = fakePlants(fakeSites([testSites.quarry]), plants);
  return createDashboardService({ dashboard: fakeDashboard(store), now: () => NOW });
}

const names = (list: { items: { name: string }[] }) => list.items.map((plant) => plant.name);

describe('the counts', () => {
  it('counts every plant by status, including inactive ones', async () => {
    const service = serviceFor([
      plantAt(1, { status: 'ACTIVE' }),
      plantAt(2, { status: 'ACTIVE' }),
      plantAt(3, { status: 'REPAIR' }),
      plantAt(4, { status: 'INACTIVE' }),
    ]);

    const { counts } = await service.summary();

    expect(counts).toEqual({ ACTIVE: 2, REPAIR: 1, INACTIVE: 1 });
  });

  it('says 0 for a status no plant has', async () => {
    const { counts } = await serviceFor([]).summary();

    expect(counts).toEqual({ ACTIVE: 0, REPAIR: 0, INACTIVE: 0 });
  });
});

describe('what is due', () => {
  it('sorts plants into overdue and due within 7 days, and leaves out the rest', async () => {
    const service = serviceFor([
      plantAt(1, { name: 'Late', nextInspectionAt: inDays(-1) }),
      plantAt(2, { name: 'Soon', nextInspectionAt: inDays(1) }),
      plantAt(3, { name: 'Later', nextInspectionAt: inDays(8) }),
      plantAt(4, { name: 'Unscheduled', nextInspectionAt: null }),
    ]);

    const { overdue, dueSoon } = await service.summary();

    expect(names(overdue)).toEqual(['Late']);
    expect(names(dueSoon)).toEqual(['Soon']);
  });

  it('treats the exact moment now as due, and the exact end of the 7 days as due', async () => {
    const service = serviceFor([
      plantAt(1, { name: 'A second ago', nextInspectionAt: new Date(NOW.getTime() - 1000) }),
      plantAt(2, { name: 'Right now', nextInspectionAt: NOW }),
      plantAt(3, { name: 'Last moment', nextInspectionAt: inDays(7) }),
      plantAt(4, { name: 'Too late', nextInspectionAt: new Date(inDays(7).getTime() + 1000) }),
    ]);

    const { overdue, dueSoon } = await service.summary();

    expect(names(overdue)).toEqual(['A second ago']);
    expect(names(dueSoon)).toEqual(['Right now', 'Last moment']);
  });

  it('leaves out inactive plants, which nobody can inspect', async () => {
    const service = serviceFor([
      plantAt(1, { name: 'Parked late', status: 'INACTIVE', nextInspectionAt: inDays(-1) }),
      plantAt(2, { name: 'Parked soon', status: 'INACTIVE', nextInspectionAt: inDays(1) }),
    ]);

    const { overdue, dueSoon } = await service.summary();

    expect(overdue.total).toBe(0);
    expect(dueSoon.total).toBe(0);
  });

  it('keeps plants in repair, which still need their inspection', async () => {
    const service = serviceFor([
      plantAt(1, { name: 'In repair', status: 'REPAIR', nextInspectionAt: inDays(-1) }),
    ]);

    const { overdue } = await service.summary();

    expect(names(overdue)).toEqual(['In repair']);
  });

  it('puts the most urgent first', async () => {
    const service = serviceFor([
      plantAt(1, { name: 'Late by a day', nextInspectionAt: inDays(-1) }),
      plantAt(2, { name: 'Late by a week', nextInspectionAt: inDays(-7) }),
      plantAt(3, { name: 'In three days', nextInspectionAt: inDays(3) }),
      plantAt(4, { name: 'Tomorrow', nextInspectionAt: inDays(1) }),
    ]);

    const { overdue, dueSoon } = await service.summary();

    expect(names(overdue)).toEqual(['Late by a week', 'Late by a day']);
    expect(names(dueSoon)).toEqual(['Tomorrow', 'In three days']);
  });

  it('lists at most 10 per group, with the true total', async () => {
    const late = Array.from({ length: 12 }, (_, i) =>
      plantAt(i + 1, { nextInspectionAt: inDays(-1 - i) }),
    );

    const { overdue } = await serviceFor(late).summary();

    expect(overdue.items).toHaveLength(10);
    expect(overdue.total).toBe(12);
    // The most overdue are the ones that stay on the list.
    expect(overdue.items[0]?.name).toBe('Plant 12');
  });

  it('sends dates as ISO text', async () => {
    const service = serviceFor([plantAt(1, { nextInspectionAt: inDays(-1) })]);

    const { overdue } = await service.summary();

    expect(overdue.items[0]?.nextInspectionAt).toBe('2026-11-03T00:00:00.000Z');
  });
});
