import { describe, expect, it } from 'vitest';
import { buildTestApp, loginAs, withSession } from '../test-utils/app.js';
import { testSites } from '../test-utils/fakes.js';

const seed = { sites: [testSites.quarry, testSites.emptyYard] };
const missingId = '019a0000-0000-7000-8000-00000000ffff';
const newSite = { name: 'North Depot', address: '9 Depot Rd, Perth WA 6000' };

describe('GET /sites', () => {
  it('returns 401 when not logged in', async () => {
    const { app } = await buildTestApp(seed);

    const res = await app.inject({ method: 'GET', url: '/sites' });

    expect(res.statusCode).toBe(401);
  });

  it('lists sites by name for an inspector, with ISO dates and plant counts', async () => {
    const { app } = await buildTestApp(seed);
    const token = await loginAs(app, 'inspector');

    const res = await app.inject({ method: 'GET', url: '/sites', cookies: withSession(token) });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      expect.objectContaining({ name: 'Empty Yard', plantCount: 0 }),
      expect.objectContaining({
        name: 'Westgate Quarry',
        plantCount: 2,
        createdAt: '2026-10-01T00:00:00.000Z',
      }),
    ]);
  });
});

describe('GET /sites/:id', () => {
  it('returns one site', async () => {
    const { app } = await buildTestApp(seed);
    const token = await loginAs(app, 'inspector');

    const res = await app.inject({
      method: 'GET',
      url: `/sites/${testSites.quarry.id}`,
      cookies: withSession(token),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: testSites.quarry.id, name: 'Westgate Quarry' });
  });

  it('returns 404 for an unknown id', async () => {
    const { app } = await buildTestApp(seed);
    const token = await loginAs(app, 'inspector');

    const res = await app.inject({
      method: 'GET',
      url: `/sites/${missingId}`,
      cookies: withSession(token),
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ message: 'Site not found' });
  });

  it('returns 400 for an id that is not a UUID', async () => {
    const { app } = await buildTestApp(seed);
    const token = await loginAs(app, 'inspector');

    const res = await app.inject({
      method: 'GET',
      url: '/sites/not-a-uuid',
      cookies: withSession(token),
    });

    expect(res.statusCode).toBe(400);
  });
});

describe('POST /sites', () => {
  it('lets an admin create a site (active by default)', async () => {
    const { app, sites } = await buildTestApp(seed);
    const token = await loginAs(app, 'admin');

    const res = await app.inject({
      method: 'POST',
      url: '/sites',
      payload: { ...newSite, plantCount: 99 },
      cookies: withSession(token),
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ ...newSite, isActive: true, plantCount: 0 });
    expect(sites.rows).toHaveLength(3);
  });

  it('returns 403 for an inspector', async () => {
    const { app, sites } = await buildTestApp(seed);
    const token = await loginAs(app, 'inspector');

    const res = await app.inject({
      method: 'POST',
      url: '/sites',
      payload: newSite,
      cookies: withSession(token),
    });

    expect(res.statusCode).toBe(403);
    expect(sites.rows).toHaveLength(2);
  });

  it('returns 400 for a blank name', async () => {
    const { app } = await buildTestApp(seed);
    const token = await loginAs(app, 'admin');

    const res = await app.inject({
      method: 'POST',
      url: '/sites',
      payload: { ...newSite, name: '   ' },
      cookies: withSession(token),
    });

    expect(res.statusCode).toBe(400);
  });
});

describe('PATCH /sites/:id', () => {
  it('changes only the fields sent', async () => {
    const { app } = await buildTestApp(seed);
    const token = await loginAs(app, 'admin');

    const res = await app.inject({
      method: 'PATCH',
      url: `/sites/${testSites.quarry.id}`,
      payload: { name: 'Westgate Quarry North' },
      cookies: withSession(token),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      name: 'Westgate Quarry North',
      address: testSites.quarry.address,
      isActive: true,
    });
  });

  it('returns 400 for an empty body', async () => {
    const { app } = await buildTestApp(seed);
    const token = await loginAs(app, 'admin');

    const res = await app.inject({
      method: 'PATCH',
      url: `/sites/${testSites.quarry.id}`,
      payload: {},
      cookies: withSession(token),
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 403 for an inspector', async () => {
    const { app } = await buildTestApp(seed);
    const token = await loginAs(app, 'inspector');

    const res = await app.inject({
      method: 'PATCH',
      url: `/sites/${testSites.quarry.id}`,
      payload: { isActive: false },
      cookies: withSession(token),
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 404 for an unknown id', async () => {
    const { app } = await buildTestApp(seed);
    const token = await loginAs(app, 'admin');

    const res = await app.inject({
      method: 'PATCH',
      url: `/sites/${missingId}`,
      payload: { isActive: false },
      cookies: withSession(token),
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /sites/:id', () => {
  it('lets an admin delete a site without plants', async () => {
    const { app, sites } = await buildTestApp(seed);
    const token = await loginAs(app, 'admin');

    const res = await app.inject({
      method: 'DELETE',
      url: `/sites/${testSites.emptyYard.id}`,
      cookies: withSession(token),
    });

    expect(res.statusCode).toBe(204);
    expect(sites.rows.map((s) => s.id)).toEqual([testSites.quarry.id]);
  });

  it('returns 409 for a site that still has plants', async () => {
    const { app } = await buildTestApp(seed);
    const token = await loginAs(app, 'admin');

    const res = await app.inject({
      method: 'DELETE',
      url: `/sites/${testSites.quarry.id}`,
      cookies: withSession(token),
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      message: 'Site still has plants; move or delete them first',
      code: 'SITE_HAS_PLANTS',
    });
  });

  it('returns 403 for an inspector', async () => {
    const { app, sites } = await buildTestApp(seed);
    const token = await loginAs(app, 'inspector');

    const res = await app.inject({
      method: 'DELETE',
      url: `/sites/${testSites.emptyYard.id}`,
      cookies: withSession(token),
    });

    expect(res.statusCode).toBe(403);
    expect(sites.rows).toHaveLength(2);
  });
});
