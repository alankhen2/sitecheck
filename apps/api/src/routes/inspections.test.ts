import { CHECKLIST_ITEMS } from '@sitecheck/shared';
import { describe, expect, it } from 'vitest';
import { buildTestApp, loginAs, withSession } from '../test-utils/app.js';
import { testPlants, testSites } from '../test-utils/fakes.js';

const seed = {
  sites: [testSites.quarry],
  plants: [testPlants.excavator, { ...testPlants.loader, status: 'INACTIVE' as const }],
};
const url = `/plants/${testPlants.excavator.id}/inspections`;
const missingUrl = '/plants/019a0000-0000-7000-8000-00000000ffff/inspections';

const allPassed = CHECKLIST_ITEMS.map((label) => ({ label, passed: true }));
const body = { items: allPassed };

async function asUser(who: 'admin' | 'inspector') {
  const built = await buildTestApp(seed);
  const token = await loginAs(built.app, who);
  return { ...built, cookies: withSession(token) };
}

describe('POST /plants/:id/inspections', () => {
  it('returns 401 when not logged in', async () => {
    const { app } = await buildTestApp(seed);

    const res = await app.inject({ method: 'POST', url, payload: body });

    expect(res.statusCode).toBe(401);
  });

  it.each(['admin', 'inspector'] as const)('lets an %s record an inspection', async (who) => {
    const { app, cookies } = await asUser(who);

    const res = await app.inject({ method: 'POST', url, cookies, payload: body });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ plantId: testPlants.excavator.id, result: 'PASS' });
  });

  it('signs with the logged-in user and ignores a result, inspector or date in the body', async () => {
    const { app, cookies } = await asUser('inspector');

    const res = await app.inject({
      method: 'POST',
      url,
      cookies,
      payload: {
        items: allPassed.map((item, index) =>
          index === 0 ? { ...item, passed: false, comment: 'Cracked panel' } : item,
        ),
        result: 'PASS',
        inspectorName: 'Alex Admin',
        inspectedAt: '2020-01-01T00:00:00.000Z',
      },
    });

    expect(res.statusCode).toBe(201);
    const inspection = res.json<{ result: string; inspectorName: string; inspectedAt: string }>();
    expect(inspection.result).toBe('FAIL');
    expect(inspection.inspectorName).toBe('Ivy Inspector');
    expect(inspection.inspectedAt.startsWith('2020')).toBe(false);
  });

  it('treats a blank comment or blank notes as none', async () => {
    const { app, cookies } = await asUser('inspector');

    const res = await app.inject({
      method: 'POST',
      url,
      cookies,
      payload: {
        items: allPassed.map((item) => ({ ...item, comment: '   ' })),
        notes: '   ',
      },
    });

    expect(res.statusCode).toBe(201);
    const inspection = res.json<{ notes: unknown; items: { comment: unknown }[] }>();
    expect(inspection.notes).toBeNull();
    expect(inspection.items.every((item) => item.comment === null)).toBe(true);
  });

  it.each([
    ['an item is missing', { items: allPassed.slice(1) }],
    ['an item is answered twice', { items: [...allPassed.slice(1), allPassed[1]] }],
    [
      'an item is not on the checklist',
      { items: [...allPassed, { label: 'Paint', passed: true }] },
    ],
    [
      'a failed item has no comment',
      { items: allPassed.map((item) => ({ ...item, passed: false })) },
    ],
    [
      'a failed item has only spaces as a comment',
      { items: allPassed.map((item) => ({ ...item, passed: false, comment: '   ' })) },
    ],
    [
      'a comment is too long',
      { items: allPassed.map((item) => ({ ...item, comment: 'x'.repeat(501) })) },
    ],
    ['the notes are too long', { ...body, notes: 'x'.repeat(2001) }],
    ['there is no checklist', {}],
  ])('returns 400 when %s', async (_case, payload) => {
    const { app, cookies, inspections } = await asUser('inspector');

    const res = await app.inject({ method: 'POST', url, cookies, payload });

    expect(res.statusCode).toBe(400);
    expect(inspections.rows).toHaveLength(0);
  });

  it('returns 400 for a malformed plant id', async () => {
    const { app, cookies } = await asUser('inspector');

    const res = await app.inject({
      method: 'POST',
      url: '/plants/not-a-uuid/inspections',
      cookies,
      payload: body,
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 404 for a plant that does not exist', async () => {
    const { app, cookies } = await asUser('inspector');

    const res = await app.inject({ method: 'POST', url: missingUrl, cookies, payload: body });

    expect(res.statusCode).toBe(404);
  });

  it('returns 409 with a code for an inactive plant', async () => {
    const { app, cookies } = await asUser('inspector');

    const res = await app.inject({
      method: 'POST',
      url: `/plants/${testPlants.loader.id}/inspections`,
      cookies,
      payload: body,
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'PLANT_INACTIVE' });
  });

  it('then blocks deleting the plant', async () => {
    const { app, cookies } = await asUser('admin');
    await app.inject({ method: 'POST', url, cookies, payload: body });

    const res = await app.inject({
      method: 'DELETE',
      url: `/plants/${testPlants.excavator.id}`,
      cookies,
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'PLANT_HAS_INSPECTIONS' });
  });
});

describe('GET /plants/:id/inspections', () => {
  it('returns 401 when not logged in', async () => {
    const { app } = await buildTestApp(seed);

    const res = await app.inject({ method: 'GET', url });

    expect(res.statusCode).toBe(401);
  });

  it('returns the history as a page', async () => {
    const { app, cookies } = await asUser('inspector');
    await app.inject({ method: 'POST', url, cookies, payload: body });

    const res = await app.inject({ method: 'GET', url, cookies });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
    const { items } = res.json<{ items: { items: unknown[] }[] }>();
    expect(items[0]?.items).toHaveLength(CHECKLIST_ITEMS.length);
  });

  it('returns an empty page for a plant with no inspections', async () => {
    const { app, cookies } = await asUser('inspector');

    const res = await app.inject({ method: 'GET', url, cookies });

    expect(res.json()).toMatchObject({ items: [], total: 0, totalPages: 0 });
  });

  it('returns 404 for a plant that does not exist', async () => {
    const { app, cookies } = await asUser('inspector');

    const res = await app.inject({ method: 'GET', url: missingUrl, cookies });

    expect(res.statusCode).toBe(404);
  });

  it('returns 400 for a page size over the limit', async () => {
    const { app, cookies } = await asUser('inspector');

    const res = await app.inject({ method: 'GET', url: `${url}?pageSize=101`, cookies });

    expect(res.statusCode).toBe(400);
  });
});
