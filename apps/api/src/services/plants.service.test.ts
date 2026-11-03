import { describe, expect, it } from 'vitest';
import { fakePlants, fakeSites, testPlants, testSites } from '../test-utils/fakes.js';
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

describe('list and get', () => {
  it('lists plants with the site name and ISO dates', async () => {
    const { service } = setup();

    const plants = await service.list({});

    expect(plants.map((p) => p.name)).toEqual(['CAT 336 Excavator', 'CAT 980 Wheel Loader']);
    expect(plants[0]).toMatchObject({
      siteName: 'Westgate Quarry',
      nextInspectionAt: '2026-11-05T00:00:00.000Z',
    });
  });

  it('filters by site', async () => {
    const { service } = setup();

    expect(await service.list({ siteId: testSites.emptyYard.id })).toEqual([]);
    expect(await service.list({ siteId: testSites.quarry.id })).toHaveLength(2);
  });

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
