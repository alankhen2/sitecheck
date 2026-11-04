import { CHECKLIST_ITEMS } from '@sitecheck/shared';
import { describe, expect, it } from 'vitest';
import { buildTestApp, loginAs, withSession } from '../test-utils/app.js';
import { testPlants, testSites } from '../test-utils/fakes.js';

const seed = { sites: [testSites.quarry], plants: [testPlants.excavator] };
const plantUrl = `/plants/${testPlants.excavator.id}`;
const url = `${plantUrl}/history`;

async function asUser(who: 'admin' | 'inspector') {
  const built = await buildTestApp(seed);
  const token = await loginAs(built.app, who);
  return { ...built, cookies: withSession(token) };
}

interface Entries {
  items: { actorName: string; entity: string; action: string; changes: unknown }[];
}

describe('GET /plants/:id/history', () => {
  it('returns 401 when not logged in', async () => {
    const { app } = await buildTestApp(seed);

    const res = await app.inject({ method: 'GET', url });

    expect(res.statusCode).toBe(401);
  });

  it('names the logged-in user as the one who changed the plant', async () => {
    const { app, cookies } = await asUser('inspector');
    await app.inject({
      method: 'PATCH',
      url: plantUrl,
      cookies,
      payload: { status: 'REPAIR' },
    });

    const res = await app.inject({ method: 'GET', url, cookies });

    expect(res.statusCode).toBe(200);
    expect(res.json<Entries>().items).toEqual([
      expect.objectContaining({
        actorName: 'Ivy Inspector',
        entity: 'Plant',
        action: 'UPDATE',
        changes: { status: { from: 'ACTIVE', to: 'REPAIR' } },
      }),
    ]);
  });

  it('writes no entry when a save changes nothing', async () => {
    const { app, cookies } = await asUser('inspector');
    await app.inject({
      method: 'PATCH',
      url: plantUrl,
      cookies,
      payload: { status: testPlants.excavator.status, name: testPlants.excavator.name },
    });

    const res = await app.inject({ method: 'GET', url, cookies });

    expect(res.json()).toMatchObject({ items: [], total: 0 });
  });

  it('shows an inspection and what it did to the plant', async () => {
    const { app, cookies } = await asUser('inspector');
    await app.inject({
      method: 'POST',
      url: `${plantUrl}/inspections`,
      cookies,
      payload: {
        items: CHECKLIST_ITEMS.map((label, index) => ({
          label,
          passed: index > 0,
          comment: index > 0 ? null : 'Cracked panel',
        })),
      },
    });

    const res = await app.inject({ method: 'GET', url, cookies });

    const { items } = res.json<Entries>();
    expect(items).toHaveLength(2);
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity: 'Inspection',
          action: 'CREATE',
          changes: { result: { from: null, to: 'FAIL' } },
        }),
        expect.objectContaining({
          entity: 'Plant',
          action: 'UPDATE',
          changes: { status: { from: 'ACTIVE', to: 'REPAIR' } },
        }),
      ]),
    );
  });

  it('returns 404 for a plant that does not exist', async () => {
    const { app, cookies } = await asUser('inspector');

    const res = await app.inject({
      method: 'GET',
      url: '/plants/019a0000-0000-7000-8000-00000000ffff/history',
      cookies,
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 400 for a page size over the limit', async () => {
    const { app, cookies } = await asUser('inspector');

    const res = await app.inject({ method: 'GET', url: `${url}?pageSize=101`, cookies });

    expect(res.statusCode).toBe(400);
  });
});
