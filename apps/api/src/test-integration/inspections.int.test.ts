import { CHECKLIST_ITEMS } from '@sitecheck/shared';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createInspectionRepository } from '../repositories/inspections.js';
import { createServices } from '../services/index.js';
import { PlantInactiveError } from '../services/inspections.service.js';
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

let seeded: Awaited<ReturnType<typeof seedUsers>>;

beforeEach(async () => {
  await resetDatabase();
  seeded = await seedUsers();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

const allPassed = CHECKLIST_ITEMS.map((label) => ({ label, passed: true, comment: null }));
const withFailure = allPassed.map((item, index) =>
  index === 2 ? { ...item, passed: false, comment: 'Brake fluid low' } : item,
);

interface InspectionBody {
  id: string;
  result: string;
  inspectorName: string;
  items: { label: string; passed: boolean; comment: string | null }[];
}

describe('recording an inspection', () => {
  it('saves a failed inspection and puts the plant in REPAIR, keeping its schedule', async () => {
    const site = await createSite();
    const due = new Date('2026-11-20T00:00:00.000Z');
    const plant = await createPlant(site.id, { nextInspectionAt: due });
    const inspector = await agentFor(app, 'inspector');

    const res = await inspector
      .post(`/plants/${plant.id}/inspections`)
      .send({ items: withFailure, notes: 'Taken out of service' })
      .expect(201);

    const body = res.body as InspectionBody;
    expect(body.result).toBe('FAIL');
    expect(body.inspectorName).toBe('Ivy Inspector');

    const saved = await prisma.plant.findUniqueOrThrow({ where: { id: plant.id } });
    expect(saved.status).toBe('REPAIR');
    expect(saved.nextInspectionAt).toEqual(due);
    expect(saved.updatedAt.getTime()).toBeGreaterThan(plant.updatedAt.getTime());
    await expect(prisma.inspectionItem.count()).resolves.toBe(CHECKLIST_ITEMS.length);
  });

  it('brings a plant out of REPAIR after a pass and schedules 30 days ahead', async () => {
    const site = await createSite();
    const plant = await createPlant(site.id, { status: 'REPAIR' });
    const admin = await agentFor(app, 'admin');
    const before = Date.now();

    await admin.post(`/plants/${plant.id}/inspections`).send({ items: allPassed }).expect(201);

    const saved = await prisma.plant.findUniqueOrThrow({ where: { id: plant.id } });
    expect(saved.status).toBe('ACTIVE');
    const daysAhead = ((saved.nextInspectionAt?.getTime() ?? 0) - before) / (24 * 60 * 60 * 1000);
    expect(daysAhead).toBeGreaterThanOrEqual(30);
    expect(daysAhead).toBeLessThan(30.01);
  });

  it('reads the items back in checklist order, whatever order they were sent in', async () => {
    const site = await createSite();
    const plant = await createPlant(site.id);
    const inspector = await agentFor(app, 'inspector');
    const url = `/plants/${plant.id}/inspections`;

    await inspector
      .post(url)
      .send({ items: [...allPassed].reverse() })
      .expect(201);

    const res = await inspector.get(url).expect(200);
    const { items } = res.body as { items: InspectionBody[] };
    expect(items[0]?.items.map((item) => item.label)).toEqual([...CHECKLIST_ITEMS]);
  });

  it('then blocks deleting the plant', async () => {
    const site = await createSite();
    const plant = await createPlant(site.id);
    const admin = await agentFor(app, 'admin');
    await admin.post(`/plants/${plant.id}/inspections`).send({ items: allPassed }).expect(201);

    const res = await admin.delete(`/plants/${plant.id}`).expect(409);

    expect((res.body as { code: string }).code).toBe('PLANT_HAS_INSPECTIONS');
  });

  it('refuses an inactive plant through the API', async () => {
    const site = await createSite();
    const plant = await createPlant(site.id, { status: 'INACTIVE' });
    const inspector = await agentFor(app, 'inspector');

    const res = await inspector
      .post(`/plants/${plant.id}/inspections`)
      .send({ items: allPassed })
      .expect(409);

    expect((res.body as { code: string }).code).toBe('PLANT_INACTIVE');
    await expect(prisma.inspection.count()).resolves.toBe(0);
  });
});

describe('the transaction', () => {
  const newInspection = (plantId: string, inspectorId: string) => ({
    plantId,
    inspectorId,
    result: 'FAIL' as const,
    notes: null,
    inspectedAt: new Date(),
    items: allPassed.map((item, position) => ({ ...item, position })),
    plantChanges: { status: 'REPAIR' as const },
  });

  it('undoes the plant change when the inspection cannot be saved', async () => {
    const site = await createSite();
    const plant = await createPlant(site.id);
    const noSuchUser = '019a0000-0000-7000-8000-00000000ffff';

    // The inspection insert breaks a foreign key, after the plant was updated.
    await expect(
      createServices(prisma).inspections.record(plant.id, noSuchUser, {
        items: withFailure,
        notes: null,
      }),
    ).rejects.toThrow();

    const saved = await prisma.plant.findUniqueOrThrow({ where: { id: plant.id } });
    expect(saved.status).toBe('ACTIVE');
    await expect(prisma.inspection.count()).resolves.toBe(0);
  });

  it('does not reactivate a plant marked inactive after the service checked it', async () => {
    const site = await createSite();
    const plant = await createPlant(site.id, { status: 'INACTIVE' });
    const repository = createInspectionRepository(prisma);

    // Straight to the repository: this is the state a race leaves it in.
    await expect(
      repository.record(newInspection(plant.id, seeded.inspector.id)),
    ).rejects.toBeInstanceOf(PlantInactiveError);

    const saved = await prisma.plant.findUniqueOrThrow({ where: { id: plant.id } });
    expect(saved.status).toBe('INACTIVE');
    await expect(prisma.inspection.count()).resolves.toBe(0);
  });

  it('keeps both of two inspections sent at the same moment', async () => {
    const site = await createSite();
    const plant = await createPlant(site.id);
    const inspector = await agentFor(app, 'inspector');
    const url = `/plants/${plant.id}/inspections`;

    await Promise.all([
      inspector.post(url).send({ items: allPassed }).expect(201),
      inspector.post(url).send({ items: withFailure }).expect(201),
    ]);

    await expect(prisma.inspection.count({ where: { plantId: plant.id } })).resolves.toBe(2);
    await expect(prisma.inspectionItem.count()).resolves.toBe(2 * CHECKLIST_ITEMS.length);
  });
});

describe('the history', () => {
  it('shows the newest first across pages, without overlap', async () => {
    const site = await createSite();
    const plant = await createPlant(site.id);
    const inspector = await agentFor(app, 'inspector');
    const url = `/plants/${plant.id}/inspections`;
    const sent: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const res = await inspector.post(url).send({ items: allPassed }).expect(201);
      sent.push((res.body as InspectionBody).id);
    }

    const first = await inspector.get(`${url}?pageSize=2`).expect(200);
    const second = await inspector.get(`${url}?pageSize=2&page=2`).expect(200);

    const ids = [
      ...(first.body as { items: InspectionBody[] }).items,
      ...(second.body as { items: InspectionBody[] }).items,
    ].map((item) => item.id);
    expect(ids).toEqual([...sent].reverse());
  });
});
