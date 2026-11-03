import { describe, expect, it } from 'vitest';
import { buildTestApp, loginAs, withSession } from '../test-utils/app.js';
import { testPlants, testSites } from '../test-utils/fakes.js';

const seed = {
  sites: [testSites.quarry, testSites.emptyYard, testSites.closedYard],
  plants: [testPlants.excavator, testPlants.loader],
  inspectionCounts: { [testPlants.excavator.id]: 3 },
};
const missingId = '019a0000-0000-7000-8000-00000000ffff';
const newPlant = {
  siteId: testSites.emptyYard.id,
  name: 'Komatsu PC210',
  type: 'Excavator',
  serialNumber: 'EY-EX-001',
};

async function asUser(who: 'admin' | 'inspector') {
  const built = await buildTestApp(seed);
  const token = await loginAs(built.app, who);
  return { ...built, cookies: withSession(token) };
}

describe('GET /plants', () => {
  it('returns 401 when not logged in', async () => {
    const { app } = await buildTestApp(seed);

    const res = await app.inject({ method: 'GET', url: '/plants' });

    expect(res.statusCode).toBe(401);
  });

  it('lists plants with their site name', async () => {
    const { app, cookies } = await asUser('inspector');

    const res = await app.inject({ method: 'GET', url: '/plants', cookies });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      expect.objectContaining({ name: 'CAT 336 Excavator', siteName: 'Westgate Quarry' }),
      expect.objectContaining({ name: 'CAT 980 Wheel Loader', nextInspectionAt: null }),
    ]);
  });

  it('filters by siteId', async () => {
    const { app, cookies } = await asUser('inspector');

    const res = await app.inject({
      method: 'GET',
      url: `/plants?siteId=${testSites.emptyYard.id}`,
      cookies,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it('returns 400 for a siteId that is not a UUID', async () => {
    const { app, cookies } = await asUser('inspector');

    const res = await app.inject({ method: 'GET', url: '/plants?siteId=abc', cookies });

    expect(res.statusCode).toBe(400);
  });
});

describe('GET /plants/:id', () => {
  it('returns one plant', async () => {
    const { app, cookies } = await asUser('inspector');

    const res = await app.inject({
      method: 'GET',
      url: `/plants/${testPlants.excavator.id}`,
      cookies,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      serialNumber: 'WGQ-EX-001',
      nextInspectionAt: '2026-11-05T00:00:00.000Z',
    });
  });

  it('returns 404 for an unknown id', async () => {
    const { app, cookies } = await asUser('inspector');

    const res = await app.inject({ method: 'GET', url: `/plants/${missingId}`, cookies });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ message: 'Plant not found' });
  });
});

describe('POST /plants', () => {
  it('lets an inspector add a plant with defaults', async () => {
    const { app, cookies, plants } = await asUser('inspector');

    const res = await app.inject({ method: 'POST', url: '/plants', payload: newPlant, cookies });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      ...newPlant,
      siteName: 'Empty Yard',
      status: 'ACTIVE',
      nextInspectionAt: null,
    });
    expect(plants.rows).toHaveLength(3);
  });

  it('returns 400 when the site does not exist', async () => {
    const { app, cookies } = await asUser('admin');

    const res = await app.inject({
      method: 'POST',
      url: '/plants',
      payload: { ...newPlant, siteId: missingId },
      cookies,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ message: 'Site does not exist' });
  });

  it('returns 409 for an inactive site', async () => {
    const { app, cookies } = await asUser('admin');

    const res = await app.inject({
      method: 'POST',
      url: '/plants',
      payload: { ...newPlant, siteId: testSites.closedYard.id },
      cookies,
    });

    expect(res.statusCode).toBe(409);
  });

  it('returns 409 for a duplicate serial number', async () => {
    const { app, cookies } = await asUser('admin');

    const res = await app.inject({
      method: 'POST',
      url: '/plants',
      payload: { ...newPlant, serialNumber: testPlants.loader.serialNumber },
      cookies,
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ message: 'Serial number is already used by another plant' });
  });

  it('returns 400 for an unknown status', async () => {
    const { app, cookies } = await asUser('admin');

    const res = await app.inject({
      method: 'POST',
      url: '/plants',
      payload: { ...newPlant, status: 'BROKEN' },
      cookies,
    });

    expect(res.statusCode).toBe(400);
  });
});

describe('PATCH /plants/:id', () => {
  it('lets an inspector change the status', async () => {
    const { app, cookies } = await asUser('inspector');

    const res = await app.inject({
      method: 'PATCH',
      url: `/plants/${testPlants.excavator.id}`,
      payload: { status: 'REPAIR' },
      cookies,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'REPAIR', serialNumber: 'WGQ-EX-001' });
  });

  it('returns 409 when moving to an inactive site', async () => {
    const { app, cookies } = await asUser('admin');

    const res = await app.inject({
      method: 'PATCH',
      url: `/plants/${testPlants.loader.id}`,
      payload: { siteId: testSites.closedYard.id },
      cookies,
    });

    expect(res.statusCode).toBe(409);
  });

  it('returns 404 for an unknown id', async () => {
    const { app, cookies } = await asUser('admin');

    const res = await app.inject({
      method: 'PATCH',
      url: `/plants/${missingId}`,
      payload: { status: 'REPAIR' },
      cookies,
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /plants/:id', () => {
  it('lets an admin delete a plant without inspections', async () => {
    const { app, cookies, plants, sites } = await asUser('admin');

    const res = await app.inject({
      method: 'DELETE',
      url: `/plants/${testPlants.loader.id}`,
      cookies,
    });

    expect(res.statusCode).toBe(204);
    expect(plants.rows.map((p) => p.id)).toEqual([testPlants.excavator.id]);
    expect(sites.rows.find((s) => s.id === testSites.quarry.id)?.plantCount).toBe(1);
  });

  it('returns 409 for a plant with inspection history', async () => {
    const { app, cookies, plants } = await asUser('admin');

    const res = await app.inject({
      method: 'DELETE',
      url: `/plants/${testPlants.excavator.id}`,
      cookies,
    });

    expect(res.statusCode).toBe(409);
    expect(plants.rows).toHaveLength(2);
  });

  it('returns 403 for an inspector', async () => {
    const { app, cookies, plants } = await asUser('inspector');

    const res = await app.inject({
      method: 'DELETE',
      url: `/plants/${testPlants.loader.id}`,
      cookies,
    });

    expect(res.statusCode).toBe(403);
    expect(plants.rows).toHaveLength(2);
  });
});
