import { describe, expect, it } from 'vitest';
import { fakeSites, testSites } from '../test-utils/fakes.js';
import { ConflictError, NotFoundError } from './errors.js';
import { createSiteService } from './sites.service.js';

const missingId = '019a0000-0000-7000-8000-00000000ffff';

describe('list and get', () => {
  it('lists sites with dates as ISO strings', async () => {
    const service = createSiteService({ sites: fakeSites([testSites.quarry]) });

    const [site] = await service.list();

    expect(site).toEqual({
      ...testSites.quarry,
      createdAt: testSites.quarry.createdAt.toISOString(),
      updatedAt: testSites.quarry.updatedAt.toISOString(),
    });
  });

  it('throws NotFoundError for an unknown id', async () => {
    const service = createSiteService({ sites: fakeSites() });

    await expect(service.get(missingId)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('create', () => {
  it('creates a site with no plants', async () => {
    const service = createSiteService({ sites: fakeSites() });

    const site = await service.create({ name: 'New Yard', address: '1 Road', isActive: true });

    expect(site).toMatchObject({
      name: 'New Yard',
      address: '1 Road',
      isActive: true,
      plantCount: 0,
    });
  });
});

describe('update', () => {
  it('changes only the fields given', async () => {
    const service = createSiteService({ sites: fakeSites([testSites.quarry]) });

    const site = await service.update(testSites.quarry.id, { isActive: false });

    expect(site).toMatchObject({ name: testSites.quarry.name, isActive: false });
  });

  it('throws NotFoundError for an unknown id', async () => {
    const service = createSiteService({ sites: fakeSites() });

    await expect(service.update(missingId, { name: 'x' })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('remove', () => {
  it('deletes a site that has no plants', async () => {
    const sites = fakeSites([testSites.emptyYard]);
    const service = createSiteService({ sites });

    await service.remove(testSites.emptyYard.id);

    expect(sites.rows).toHaveLength(0);
  });

  it('refuses to delete a site that still has plants', async () => {
    const sites = fakeSites([testSites.quarry]);
    const service = createSiteService({ sites });

    await expect(service.remove(testSites.quarry.id)).rejects.toBeInstanceOf(ConflictError);
    expect(sites.rows).toHaveLength(1);
  });

  it('throws NotFoundError for an unknown id', async () => {
    const service = createSiteService({ sites: fakeSites() });

    await expect(service.remove(missingId)).rejects.toBeInstanceOf(NotFoundError);
  });
});
