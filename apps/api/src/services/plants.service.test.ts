import type { ListPlantsQuery, PlantStatus } from '@sitecheck/shared';
import { describe, expect, it } from 'vitest';
import { fakePlants, fakeSites, plantAt, testPlants, testSites } from '../test-utils/fakes.js';
import { ConflictError, InvalidReferenceError, NotFoundError } from './errors.js';
import { createPlantService } from './plants.service.js';

const missingId = '019a0000-0000-7000-8000-00000000ffff';

/** Quarry with an excavator (3 inspections) and a loader (none), plus two empty sites. */
function setup() {
  const sites = fakeSites([testSites.quarry, testSites.emptyYard, testSites.closedYard]);
  const plants = fakePlants(sites, [testPlants.excavator, testPlants.loader], {
    [testPlants.excavator.id]: 3,
  });
  return { sites, plants, service: createPlantService({ plants, sites }) };
}

const newPlant = {
  siteId: testSites.emptyYard.id,
  name: 'Komatsu PC210',
  type: 'Excavator',
  serialNumber: 'EY-EX-001',
  status: 'ACTIVE' as const,
  nextInspectionAt: '2026-11-20T00:00:00.000Z',
};

/** Full list query with the schema defaults, so tests only spell what they vary. */
const query = (overrides: Partial<ListPlantsQuery> = {}): ListPlantsQuery => ({
  sort: 'name',
  page: 1,
  pageSize: 20,
  ...overrides,
});

describe('list: shape and filters', () => {
  it('returns a page with the site name and ISO dates', async () => {
    const { service } = setup();

    const page = await service.list(query());

    expect(page).toMatchObject({ page: 1, pageSize: 20, total: 2, totalPages: 1 });
    expect(page.items.map((p) => p.name)).toEqual(['CAT 336 Excavator', 'CAT 980 Wheel Loader']);
    expect(page.items[0]).toMatchObject({
      siteName: 'Westgate Quarry',
      nextInspectionAt: '2026-11-05T00:00:00.000Z',
    });
  });

  it('filters by site', async () => {
    const { service } = setup();

    expect((await service.list(query({ siteId: testSites.emptyYard.id }))).total).toBe(0);
    expect((await service.list(query({ siteId: testSites.quarry.id }))).total).toBe(2);
  });

  it('searches name, type and serial number, ignoring case', async () => {
    const { service } = setup();
    const names = async (q: string) => (await service.list(query({ q }))).items.map((p) => p.name);

    expect(await names('wheel')).toEqual(['CAT 980 Wheel Loader']); // name
    expect(await names('EXCAVATOR')).toEqual(['CAT 336 Excavator']); // type
    expect(await names('wgq-wl')).toEqual(['CAT 980 Wheel Loader']); // serial number
    expect(await names('cat')).toHaveLength(2);
  });

  it('filters by one or more statuses', async () => {
    const sites = fakeSites([{ ...testSites.quarry, plantCount: 3 }]);
    const plants = fakePlants(sites, [
      testPlants.excavator,
      { ...testPlants.loader, status: 'REPAIR' },
      plantAt(3, { status: 'INACTIVE' }),
    ]);
    const service = createPlantService({ plants, sites });
    const statuses = async (status: PlantStatus[]) =>
      (await service.list(query({ status }))).items.map((p) => p.status).sort();

    expect(await statuses(['REPAIR'])).toEqual(['REPAIR']);
    expect(await statuses(['ACTIVE', 'REPAIR'])).toEqual(['ACTIVE', 'REPAIR']);
  });

  it('combines filters with AND', async () => {
    const { service } = setup();

    const page = await service.list(query({ q: 'cat', status: ['ACTIVE'], siteId: missingId }));

    expect(page.total).toBe(0);
  });
});

describe('list: pagination', () => {
  /** 25 plants named "Plant 01" ... "Plant 25". */
  function setupMany() {
    const rows = Array.from({ length: 25 }, (_, i) => plantAt(i + 1));
    const sites = fakeSites([{ ...testSites.quarry, plantCount: rows.length }]);
    return createPlantService({ plants: fakePlants(sites, rows), sites });
  }

  it('splits results into pages and reports the totals', async () => {
    const service = setupMany();

    const first = await service.list(query({ pageSize: 10 }));
    const last = await service.list(query({ pageSize: 10, page: 3 }));

    expect(first).toMatchObject({ total: 25, totalPages: 3 });
    expect(first.items.map((p) => p.name)).toEqual(
      Array.from({ length: 10 }, (_, i) => `Plant ${String(i + 1).padStart(2, '0')}`),
    );
    expect(last.items.map((p) => p.name)).toEqual([
      'Plant 21',
      'Plant 22',
      'Plant 23',
      'Plant 24',
      'Plant 25',
    ]);
  });

  it('returns an empty page past the end, not an error', async () => {
    const service = setupMany();

    const page = await service.list(query({ pageSize: 10, page: 4 }));

    expect(page).toMatchObject({ items: [], page: 4, total: 25, totalPages: 3 });
  });

  it('reports zero pages when nothing matches', async () => {
    const service = setupMany();

    const page = await service.list(query({ q: 'no such plant' }));

    expect(page).toMatchObject({ items: [], total: 0, totalPages: 0 });
  });

  it('never repeats or skips a plant across pages when names tie', async () => {
    const rows = Array.from({ length: 6 }, (_, i) => plantAt(i + 1, { name: 'Same Name' }));
    const sites = fakeSites([{ ...testSites.quarry, plantCount: rows.length }]);
    const service = createPlantService({ plants: fakePlants(sites, rows.reverse()), sites });

    const pages = await Promise.all(
      [1, 2, 3].map((page) => service.list(query({ pageSize: 2, page }))),
    );
    const ids = pages.flatMap((p) => p.items.map((item) => item.id));

    expect(ids).toEqual([...ids].sort()); // ordered by id as the tie-breaker
    expect(new Set(ids).size).toBe(6);
  });
});

describe('list: sorting by next inspection', () => {
  it('puts the soonest first and plants without a date last', async () => {
    const sites = fakeSites([{ ...testSites.quarry, plantCount: 4 }]);
    const plants = fakePlants(sites, [
      plantAt(1, { name: 'No date', nextInspectionAt: null }),
      plantAt(2, { name: 'Later', nextInspectionAt: new Date('2026-12-01T00:00:00Z') }),
      plantAt(3, { name: 'Overdue', nextInspectionAt: new Date('2026-10-20T00:00:00Z') }),
      plantAt(4, { name: 'Soon', nextInspectionAt: new Date('2026-11-06T00:00:00Z') }),
    ]);
    const service = createPlantService({ plants, sites });

    const page = await service.list(query({ sort: 'nextInspectionAt' }));

    expect(page.items.map((p) => p.name)).toEqual(['Overdue', 'Soon', 'Later', 'No date']);
  });
});

describe('get', () => {
  it('throws NotFoundError for an unknown id', async () => {
    const { service } = setup();

    await expect(service.get(missingId)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('create', () => {
  it('creates a plant at an active site', async () => {
    const { service, sites } = setup();

    const plant = await service.create(newPlant);

    expect(plant).toMatchObject({ ...newPlant, siteName: 'Empty Yard' });
    expect(sites.rows.find((s) => s.id === testSites.emptyYard.id)?.plantCount).toBe(1);
  });

  it('rejects a site that does not exist', async () => {
    const { service } = setup();

    await expect(service.create({ ...newPlant, siteId: missingId })).rejects.toBeInstanceOf(
      InvalidReferenceError,
    );
  });

  it('rejects an inactive site', async () => {
    const { service } = setup();

    await expect(service.create({ ...newPlant, siteId: testSites.closedYard.id })).rejects.toThrow(
      'inactive site',
    );
  });

  it('rejects a serial number that is already used', async () => {
    const { service } = setup();

    await expect(
      service.create({ ...newPlant, serialNumber: testPlants.loader.serialNumber }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('update', () => {
  it('changes only the fields given', async () => {
    const { service } = setup();

    const plant = await service.update(testPlants.excavator.id, { status: 'REPAIR' });

    expect(plant).toMatchObject({ status: 'REPAIR', name: testPlants.excavator.name });
  });

  it('clears the next inspection date when sent null', async () => {
    const { service } = setup();

    const plant = await service.update(testPlants.excavator.id, { nextInspectionAt: null });

    expect(plant.nextInspectionAt).toBeNull();
  });

  it('keeps its own serial number without a conflict', async () => {
    const { service } = setup();

    const plant = await service.update(testPlants.loader.id, {
      serialNumber: testPlants.loader.serialNumber,
      name: 'Renamed',
    });

    expect(plant.name).toBe('Renamed');
  });

  it("rejects another plant's serial number", async () => {
    const { service } = setup();

    await expect(
      service.update(testPlants.loader.id, { serialNumber: testPlants.excavator.serialNumber }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('moves a plant to another active site and updates both counts', async () => {
    const { service, sites } = setup();

    const plant = await service.update(testPlants.loader.id, { siteId: testSites.emptyYard.id });

    expect(plant.siteName).toBe('Empty Yard');
    const count = (id: string) => sites.rows.find((s) => s.id === id)?.plantCount;
    expect(count(testSites.quarry.id)).toBe(1);
    expect(count(testSites.emptyYard.id)).toBe(1);
  });

  it('rejects moving a plant to an inactive site', async () => {
    const { service } = setup();

    await expect(
      service.update(testPlants.loader.id, { siteId: testSites.closedYard.id }),
    ).rejects.toThrow('inactive site');
  });

  it('allows editing a plant that already sits at an inactive site', async () => {
    const sites = fakeSites([{ ...testSites.closedYard, plantCount: 1 }]);
    const parked = { ...testPlants.loader, siteId: testSites.closedYard.id };
    const service = createPlantService({ plants: fakePlants(sites, [parked]), sites });

    const plant = await service.update(parked.id, { status: 'INACTIVE' });

    expect(plant.status).toBe('INACTIVE');
  });

  it('throws NotFoundError for an unknown id', async () => {
    const { service } = setup();

    await expect(service.update(missingId, { name: 'x' })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('remove', () => {
  it('deletes a plant without inspections', async () => {
    const { service, plants } = setup();

    await service.remove(testPlants.loader.id);

    expect(plants.rows.map((p) => p.id)).toEqual([testPlants.excavator.id]);
  });

  it('refuses to delete a plant with inspection history', async () => {
    const { service, plants } = setup();

    await expect(service.remove(testPlants.excavator.id)).rejects.toThrow(
      'set its status to INACTIVE',
    );
    expect(plants.rows).toHaveLength(2);
  });

  it('throws NotFoundError for an unknown id', async () => {
    const { service } = setup();

    await expect(service.remove(missingId)).rejects.toBeInstanceOf(NotFoundError);
  });
});
