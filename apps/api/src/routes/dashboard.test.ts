import { describe, expect, it } from 'vitest';
import { buildTestApp, loginAs, withSession } from '../test-utils/app.js';
import { plantAt, testSites } from '../test-utils/fakes.js';

const DAY = 24 * 60 * 60 * 1000;
const seed = {
  sites: [testSites.quarry],
  plants: [
    plantAt(1, { name: 'Late', nextInspectionAt: new Date(Date.now() - DAY) }),
    plantAt(2, { name: 'Soon', status: 'REPAIR', nextInspectionAt: new Date(Date.now() + DAY) }),
  ],
};

describe('GET /dashboard', () => {
  it('returns 401 when not logged in', async () => {
    const { app } = await buildTestApp(seed);

    const res = await app.inject({ method: 'GET', url: '/dashboard' });

    expect(res.statusCode).toBe(401);
  });

  it.each(['admin', 'inspector'] as const)('shows an %s the overview', async (who) => {
    const { app } = await buildTestApp(seed);
    const cookies = withSession(await loginAs(app, who));

    const res = await app.inject({ method: 'GET', url: '/dashboard', cookies });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      counts: { ACTIVE: 1, REPAIR: 1, INACTIVE: 0 },
      overdue: { total: 1, items: [{ name: 'Late', siteName: 'Westgate Quarry' }] },
      dueSoon: { total: 1, items: [{ name: 'Soon' }] },
    });
  });
});
