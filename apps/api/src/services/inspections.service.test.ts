import { CHECKLIST_ITEMS, type CreateInspectionBody } from '@sitecheck/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  fakeInspections,
  fakePlants,
  fakeSites,
  testPlants,
  testSites,
  testUsers,
} from '../test-utils/fakes.js';
import { ConflictError, NotFoundError } from './errors.js';
import { createInspectionService, PlantInactiveError } from './inspections.service.js';
import type { PlantRecord } from './plants.service.js';

const missingId = '019a0000-0000-7000-8000-00000000ffff';
const NOW = new Date('2026-11-04T01:30:00.000Z');
const inspector = testUsers.inspector.id;
const excavatorId = testPlants.excavator.id;

function setup(plant: PlantRecord = testPlants.excavator) {
  const sites = fakeSites([testSites.quarry]);
  const plants = fakePlants(sites, [plant]);
  const inspections = fakeInspections(plants, [testUsers.admin, testUsers.inspector]);
  const service = createInspectionService({ inspections, plants, now: () => NOW });
  const plantNow = () => plants.rows.find((p) => p.id === plant.id);
  return { service, plants, inspections, plantNow };
}

/** A checklist with every item passed, except the labels named. */
function checklist(...failed: string[]): CreateInspectionBody {
  return {
    notes: null,
    items: CHECKLIST_ITEMS.map((label) => ({
      label,
      passed: !failed.includes(label),
      comment: failed.includes(label) ? 'Needs attention' : null,
    })),
  };
}

describe('the result', () => {
  it('is PASS when every item passed', async () => {
    const { service } = setup();

    const inspection = await service.record(excavatorId, inspector, checklist());

    expect(inspection.result).toBe('PASS');
  });

  it('is FAIL when even one item failed', async () => {
    const { service } = setup();

    const inspection = await service.record(excavatorId, inspector, checklist('Tyres or tracks'));

    expect(inspection.result).toBe('FAIL');
  });
});

describe('a failed inspection', () => {
  it('puts the plant in REPAIR', async () => {
    const { service, plantNow } = setup();

    await service.record(excavatorId, inspector, checklist('Brakes and controls'));

    expect(plantNow()?.status).toBe('REPAIR');
  });

  it('leaves the schedule alone, so the plant still shows as due', async () => {
    const { service, plantNow } = setup();

    await service.record(excavatorId, inspector, checklist('Brakes and controls'));

    expect(plantNow()?.nextInspectionAt).toEqual(testPlants.excavator.nextInspectionAt);
  });
});

describe('a passed inspection', () => {
  it('schedules the next one 30 days after this inspection, not after the old date', async () => {
    const overdue = { ...testPlants.excavator, nextInspectionAt: new Date('2026-10-01T00:00:00Z') };
    const { service, plantNow } = setup(overdue);

    await service.record(excavatorId, inspector, checklist());

    expect(plantNow()?.nextInspectionAt).toEqual(new Date('2026-12-04T01:30:00.000Z'));
  });

  it('gives a plant with no schedule its first date', async () => {
    const { service, plantNow } = setup(testPlants.loader);

    await service.record(testPlants.loader.id, inspector, checklist());

    expect(plantNow()?.nextInspectionAt).toEqual(new Date('2026-12-04T01:30:00.000Z'));
  });

  it('brings a plant in REPAIR back to ACTIVE', async () => {
    const { service, plantNow } = setup({ ...testPlants.excavator, status: 'REPAIR' });

    await service.record(excavatorId, inspector, checklist());

    expect(plantNow()?.status).toBe('ACTIVE');
  });
});

describe('what cannot be inspected', () => {
  it('refuses an inactive plant and records nothing', async () => {
    const { service, inspections, plantNow } = setup({
      ...testPlants.excavator,
      status: 'INACTIVE',
    });

    const attempt = service.record(excavatorId, inspector, checklist());

    await expect(attempt).rejects.toBeInstanceOf(ConflictError);
    await expect(attempt).rejects.toMatchObject({ code: 'PLANT_INACTIVE' });
    expect(inspections.rows).toHaveLength(0);
    expect(plantNow()?.status).toBe('INACTIVE');
  });

  it('decides that itself, without asking the repository to save anything', async () => {
    const { service, inspections } = setup({ ...testPlants.excavator, status: 'INACTIVE' });
    const save = vi.spyOn(inspections, 'record');

    await expect(service.record(excavatorId, inspector, checklist())).rejects.toBeInstanceOf(
      PlantInactiveError,
    );

    expect(save).not.toHaveBeenCalled();
  });

  it('answers 404 for a plant that does not exist', async () => {
    const { service } = setup();

    await expect(service.record(missingId, inspector, checklist())).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe('what is stored', () => {
  it('signs the inspection and dates it from the server clock', async () => {
    const { service } = setup();

    const inspection = await service.record(excavatorId, inspector, checklist());

    expect(inspection).toMatchObject({
      plantId: excavatorId,
      inspectorName: 'Ivy Inspector',
      inspectedAt: '2026-11-04T01:30:00.000Z',
    });
  });

  it('keeps the checklist order, whatever order the answers arrived in', async () => {
    const { service } = setup();
    const answers = checklist();

    const inspection = await service.record(excavatorId, inspector, {
      ...answers,
      items: [...answers.items].reverse(),
    });

    expect(inspection.items.map((item) => item.label)).toEqual([...CHECKLIST_ITEMS]);
  });

  it('keeps the notes and each comment', async () => {
    const { service } = setup();

    const inspection = await service.record(excavatorId, inspector, {
      ...checklist('Lights and alarms'),
      notes: 'Checked after the night shift',
    });

    expect(inspection.notes).toBe('Checked after the night shift');
    expect(inspection.items.find((item) => item.label === 'Lights and alarms')).toEqual({
      label: 'Lights and alarms',
      passed: false,
      comment: 'Needs attention',
    });
  });
});

describe('listing the inspections of a plant', () => {
  it('shows the newest first, one page at a time', async () => {
    const { plants, inspections } = setup();
    let day = 1;
    const service = createInspectionService({
      inspections,
      plants,
      now: () => new Date(`2026-11-0${String(day)}T00:00:00.000Z`),
    });
    for (; day <= 3; day += 1) await service.record(excavatorId, inspector, checklist());

    const page = await service.listForPlant(excavatorId, { page: 1, pageSize: 2 });

    expect(page).toMatchObject({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
    expect(page.items.map((i) => i.inspectedAt)).toEqual([
      '2026-11-03T00:00:00.000Z',
      '2026-11-02T00:00:00.000Z',
    ]);
  });

  it('answers 404 for a plant that does not exist', async () => {
    const { service } = setup();

    await expect(service.listForPlant(missingId, { page: 1, pageSize: 20 })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
