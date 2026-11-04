import { describe, expect, it } from 'vitest';
import {
  fakeAudit,
  fakePlants,
  fakeSites,
  testPlants,
  testSites,
  testUsers,
} from '../test-utils/fakes.js';
import {
  changesBetween,
  createAuditService,
  inspectionSnapshot,
  plantSnapshot,
} from './audit.service.js';
import { NotFoundError } from './errors.js';

const before = { name: 'Old', status: 'ACTIVE', nextInspectionAt: null };

describe('changesBetween', () => {
  it('lists only the fields that differ', () => {
    const after = { name: 'Old', status: 'REPAIR', nextInspectionAt: null };

    expect(changesBetween(before, after)).toEqual({ status: { from: 'ACTIVE', to: 'REPAIR' } });
  });

  it('is empty when nothing changed, so no entry gets written', () => {
    expect(changesBetween(before, { ...before })).toEqual({});
  });

  it('shows a value being set and being cleared', () => {
    expect(
      changesBetween({ nextInspectionAt: null }, { nextInspectionAt: '2026-12-04T00:00:00.000Z' }),
    ).toEqual({ nextInspectionAt: { from: null, to: '2026-12-04T00:00:00.000Z' } });
    expect(
      changesBetween({ nextInspectionAt: '2026-12-04T00:00:00.000Z' }, { nextInspectionAt: null }),
    ).toEqual({ nextInspectionAt: { from: '2026-12-04T00:00:00.000Z', to: null } });
  });

  it('records what a new record holds, leaving out empty fields', () => {
    expect(changesBetween(null, before)).toEqual({
      name: { from: null, to: 'Old' },
      status: { from: null, to: 'ACTIVE' },
    });
  });

  it('records what a deleted record held, so it can still be read afterwards', () => {
    expect(changesBetween(before, null)).toEqual({
      name: { from: 'Old', to: null },
      status: { from: 'ACTIVE', to: null },
    });
  });
});

describe('plantSnapshot', () => {
  it('holds the site by name, which still means something if the site is renamed or deleted', () => {
    const snapshot = plantSnapshot(testPlants.excavator);

    expect(snapshot).toEqual({
      name: 'CAT 336 Excavator',
      type: 'Excavator',
      serialNumber: 'WGQ-EX-001',
      site: 'Westgate Quarry',
      status: 'ACTIVE',
      nextInspectionAt: '2026-11-05T00:00:00.000Z',
    });
  });

  it('does not treat the same moment as a change', () => {
    const sameMoment = {
      ...testPlants.excavator,
      nextInspectionAt: new Date(testPlants.excavator.nextInspectionAt),
    };

    expect(changesBetween(plantSnapshot(testPlants.excavator), plantSnapshot(sameMoment))).toEqual(
      {},
    );
  });
});

describe('inspectionSnapshot', () => {
  it('holds the result', () => {
    expect(inspectionSnapshot('FAIL')).toEqual({ result: 'FAIL' });
  });
});

describe('the history of a plant', () => {
  const plantId = testPlants.excavator.id;

  function setup() {
    const sites = fakeSites([testSites.quarry]);
    const plants = fakePlants(sites, [testPlants.excavator]);
    const audit = fakeAudit([testUsers.admin, testUsers.inspector]);
    return { audit, service: createAuditService({ audit, plants }) };
  }

  it('names who did it and shows the newest first, one page at a time', async () => {
    const { audit, service } = setup();
    for (const [day, userId] of [
      [1, testUsers.admin.id],
      [2, testUsers.inspector.id],
      [3, testUsers.inspector.id],
    ] as const) {
      audit.write({
        plantId,
        userId,
        entity: 'Plant',
        entityId: plantId,
        action: 'UPDATE',
        changes: { name: { from: 'a', to: 'b' } },
        createdAt: new Date(`2026-11-0${String(day)}T00:00:00.000Z`),
      });
    }

    const page = await service.historyForPlant(plantId, { page: 1, pageSize: 2 });

    expect(page).toMatchObject({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
    expect(page.items.map((entry) => entry.createdAt)).toEqual([
      '2026-11-03T00:00:00.000Z',
      '2026-11-02T00:00:00.000Z',
    ]);
    expect(page.items[0]).toMatchObject({
      actorName: 'Ivy Inspector',
      entity: 'Plant',
      action: 'UPDATE',
      changes: { name: { from: 'a', to: 'b' } },
    });
  });

  it('answers 404 for a plant that does not exist', async () => {
    const { service } = setup();

    await expect(
      service.historyForPlant('019a0000-0000-7000-8000-00000000ffff', { page: 1, pageSize: 20 }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
