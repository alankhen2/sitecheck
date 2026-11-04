import { CHECKLIST_ITEMS } from '@sitecheck/shared';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createDashboardRepository } from '../repositories/dashboard.js';
import {
  agentFor,
  createPlant,
  createSite,
  prisma,
  resetDatabase,
  seedUsers,
  startApp,
} from './helpers.js';

const { app } = await startApp();

beforeEach(async () => {
  await resetDatabase();
  await seedUsers();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

const NOW = new Date('2026-11-04T00:00:00.000Z');
const SOON_UNTIL = new Date('2026-11-11T00:00:00.000Z');
const window = { now: NOW, soonUntil: SOON_UNTIL, limit: 10 };
const second = 1000;

describe('the summary', () => {
  it('draws the lines where the service asks, down to the exact moment', async () => {
    const site = await createSite();
    const at = (name: string, nextInspectionAt: Date | null) =>
      createPlant(site.id, { name, nextInspectionAt });
    await at('A second ago', new Date(NOW.getTime() - second));
    await at('Right now', NOW);
    await at('Last moment', SOON_UNTIL);
    await at('Too late', new Date(SOON_UNTIL.getTime() + second));
    await at('Unscheduled', null);

    const { overdue, dueSoon } = await createDashboardRepository(prisma).summary(window);

    expect(overdue.rows.map((p) => p.name)).toEqual(['A second ago']);
    expect(dueSoon.rows.map((p) => p.name)).toEqual(['Right now', 'Last moment']);
  });

  it('counts inactive plants by status but never as due', async () => {
    const site = await createSite();
    const late = new Date(NOW.getTime() - second);
    await createPlant(site.id, { status: 'INACTIVE', nextInspectionAt: late });
    await createPlant(site.id, { status: 'INACTIVE', nextInspectionAt: NOW });
    await createPlant(site.id, { status: 'REPAIR', nextInspectionAt: late });

    const { counts, overdue, dueSoon } = await createDashboardRepository(prisma).summary(window);

    expect(counts).toEqual({ INACTIVE: 2, REPAIR: 1 });
    expect(overdue.total).toBe(1);
    expect(dueSoon.total).toBe(0);
  });

  it('keeps the most urgent when the list is cut, and still gives the true total', async () => {
    const site = await createSite();
    for (let days = 1; days <= 3; days += 1) {
      await createPlant(site.id, {
        name: `${String(days)} days late`,
        nextInspectionAt: new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000),
      });
    }

    const { overdue } = await createDashboardRepository(prisma).summary({ ...window, limit: 2 });

    expect(overdue.rows.map((p) => p.name)).toEqual(['3 days late', '2 days late']);
    expect(overdue.total).toBe(3);
  });
});

describe('GET /dashboard', () => {
  it('moves a plant off the overdue list once it passes an inspection', async () => {
    const site = await createSite();
    const plant = await createPlant(site.id, {
      name: 'Late',
      nextInspectionAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });
    const inspector = await agentFor(app, 'inspector');
    const before = await inspector.get('/dashboard').expect(200);
    expect((before.body as { overdue: { total: number } }).overdue.total).toBe(1);

    await inspector
      .post(`/plants/${plant.id}/inspections`)
      .send({ items: CHECKLIST_ITEMS.map((label) => ({ label, passed: true })) })
      .expect(201);

    const after = await inspector.get('/dashboard').expect(200);
    expect(after.body).toMatchObject({ overdue: { total: 0 }, dueSoon: { total: 0 } });
  });

  it('answers with zeros and empty lists when there are no plants', async () => {
    const admin = await agentFor(app, 'admin');

    const res = await admin.get('/dashboard').expect(200);

    expect(res.body).toEqual({
      counts: { ACTIVE: 0, REPAIR: 0, INACTIVE: 0 },
      overdue: { items: [], total: 0 },
      dueSoon: { items: [], total: 0 },
    });
  });
});
