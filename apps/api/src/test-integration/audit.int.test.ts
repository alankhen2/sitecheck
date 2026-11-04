import { CHECKLIST_ITEMS } from '@sitecheck/shared';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPlantRepository } from '../repositories/plants.js';
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
  index === 0 ? { ...item, passed: false, comment: 'Cracked panel' } : item,
);

type Changes = Record<string, { from: string | null; to: string | null }>;
interface Page {
  items: { entity: string; action: string; actorName: string; changes: Changes }[];
  total: number;
}

const entriesFor = (entityId: string) =>
  prisma.auditLog.findMany({ where: { entityId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });

describe('writing the log', () => {
  it('records a new plant with who added it', async () => {
    const site = await createSite({ name: 'Westgate Quarry' });
    const inspector = await agentFor(app, 'inspector');

    const res = await inspector
      .post('/plants')
      .send({ siteId: site.id, name: 'Lift', type: 'Forklift', serialNumber: 'A-1' })
      .expect(201);

    const [entry, ...others] = await entriesFor((res.body as { id: string }).id);
    expect(others).toEqual([]);
    expect(entry).toMatchObject({
      entity: 'Plant',
      action: 'CREATE',
      userId: seeded.inspector.id,
      changes: {
        name: { from: null, to: 'Lift' },
        site: { from: null, to: 'Westgate Quarry' },
        status: { from: null, to: 'ACTIVE' },
      },
    });
  });

  it('records only what a change really changed, with the site by name', async () => {
    const [from, to] = await Promise.all([
      createSite({ name: 'Old Yard' }),
      createSite({ name: 'New Yard' }),
    ]);
    const plant = await createPlant(from.id, { name: 'Lift' });
    const admin = await agentFor(app, 'admin');

    await admin.patch(`/plants/${plant.id}`).send({ siteId: to.id, name: 'Lift' }).expect(200);

    const [entry] = await entriesFor(plant.id);
    expect(entry?.changes).toEqual({ site: { from: 'Old Yard', to: 'New Yard' } });
    expect(entry?.userId).toBe(seeded.admin.id);
  });

  it('writes nothing for a save that changes nothing', async () => {
    const site = await createSite();
    const plant = await createPlant(site.id, { name: 'Lift' });
    const admin = await agentFor(app, 'admin');

    await admin.patch(`/plants/${plant.id}`).send({ name: 'Lift' }).expect(200);

    await expect(prisma.auditLog.count()).resolves.toBe(0);
  });

  it('keeps what a deleted plant held, after the plant is gone', async () => {
    const site = await createSite();
    const plant = await createPlant(site.id, { name: 'Lift', serialNumber: 'GONE-1' });
    const admin = await agentFor(app, 'admin');

    await admin.delete(`/plants/${plant.id}`).expect(204);

    const [entry] = await entriesFor(plant.id);
    expect(entry).toMatchObject({
      action: 'DELETE',
      userId: seeded.admin.id,
      changes: {
        name: { from: 'Lift', to: null },
        serialNumber: { from: 'GONE-1', to: null },
      },
    });
  });

  it('records an inspection, and its effect on the plant under the inspector', async () => {
    const site = await createSite();
    const plant = await createPlant(site.id);
    const inspector = await agentFor(app, 'inspector');

    const res = await inspector
      .post(`/plants/${plant.id}/inspections`)
      .send({ items: withFailure })
      .expect(201);

    const [plantEntry] = await entriesFor(plant.id);
    expect(plantEntry).toMatchObject({
      action: 'UPDATE',
      userId: seeded.inspector.id,
      changes: { status: { from: 'ACTIVE', to: 'REPAIR' } },
    });
    const [inspectionEntry] = await entriesFor((res.body as { id: string }).id);
    expect(inspectionEntry).toMatchObject({
      entity: 'Inspection',
      action: 'CREATE',
      changes: { result: { from: null, to: 'FAIL' } },
    });
  });

  it('records the new schedule as an exact moment when an inspection passes', async () => {
    const site = await createSite();
    const plant = await createPlant(site.id);
    const inspector = await agentFor(app, 'inspector');

    await inspector.post(`/plants/${plant.id}/inspections`).send({ items: allPassed }).expect(201);

    const saved = await prisma.plant.findUniqueOrThrow({ where: { id: plant.id } });
    const [entry] = await entriesFor(plant.id);
    expect(entry?.changes).toEqual({
      nextInspectionAt: { from: null, to: saved.nextInspectionAt?.toISOString() },
    });
  });
});

describe('the log and its change are saved together', () => {
  const noSuchUser = '019a0000-0000-7000-8000-00000000ffff';

  it('leaves no entry when the change is refused', async () => {
    const site = await createSite();
    const [plant] = await Promise.all([
      createPlant(site.id, { serialNumber: 'A-1' }),
      createPlant(site.id, { serialNumber: 'A-2' }),
    ]);
    const admin = await agentFor(app, 'admin');

    await admin.patch(`/plants/${plant.id}`).send({ serialNumber: 'A-2' }).expect(409);

    await expect(prisma.auditLog.count()).resolves.toBe(0);
  });

  it('undoes the change when the entry cannot be written', async () => {
    const site = await createSite();
    const plant = await createPlant(site.id, { name: 'Lift' });
    const repository = createPlantRepository(prisma);

    // The entry breaks a foreign key, after the plant was updated.
    await expect(repository.update(plant.id, { name: 'Renamed' }, noSuchUser)).rejects.toThrow();

    const saved = await prisma.plant.findUniqueOrThrow({ where: { id: plant.id } });
    expect(saved.name).toBe('Lift');
  });

  it('keeps the plant when the entry for deleting it cannot be written', async () => {
    const site = await createSite();
    const plant = await createPlant(site.id);
    const repository = createPlantRepository(prisma);

    await expect(repository.delete(plant.id, noSuchUser)).rejects.toThrow();

    await expect(prisma.plant.count({ where: { id: plant.id } })).resolves.toBe(1);
  });

  it('gives a true "from" value when two changes arrive together', async () => {
    const site = await createSite();
    const plant = await createPlant(site.id, { status: 'ACTIVE' });
    const admin = await agentFor(app, 'admin');
    const inspector = await agentFor(app, 'inspector');

    await Promise.all([
      admin.patch(`/plants/${plant.id}`).send({ status: 'REPAIR' }).expect(200),
      inspector.patch(`/plants/${plant.id}`).send({ status: 'INACTIVE' }).expect(200),
    ]);

    // Whichever ran first, the second must start from what the first left, so
    // the entries form one unbroken chain ending at the plant's real status.
    const entries = await entriesFor(plant.id);
    const steps = entries.map((entry) => (entry.changes as Changes).status);
    expect(steps).toHaveLength(2);
    const saved = await prisma.plant.findUniqueOrThrow({ where: { id: plant.id } });
    const chained = steps.some((first, i) => {
      const second = steps[1 - i];
      return first?.from === 'ACTIVE' && first.to === second?.from && second.to === saved.status;
    });
    expect(chained).toBe(true);
  });
});

describe('GET /plants/:id/history', () => {
  it('shows the plant and its inspections, newest first, with names', async () => {
    const site = await createSite();
    const plant = await createPlant(site.id, { name: 'Lift' });
    const admin = await agentFor(app, 'admin');
    const inspector = await agentFor(app, 'inspector');

    await admin.patch(`/plants/${plant.id}`).send({ name: 'Renamed' }).expect(200);
    await inspector
      .post(`/plants/${plant.id}/inspections`)
      .send({ items: withFailure })
      .expect(201);

    const res = await inspector.get(`/plants/${plant.id}/history`).expect(200);
    const body = res.body as Page;
    expect(body.total).toBe(3);
    expect(body.items.at(-1)).toMatchObject({
      actorName: 'Alex Admin',
      changes: { name: { from: 'Lift', to: 'Renamed' } },
    });
    expect(body.items.map((item) => item.entity).sort()).toEqual(['Inspection', 'Plant', 'Plant']);
  });

  it('does not mix in another plant', async () => {
    const site = await createSite();
    const [plant, other] = await Promise.all([createPlant(site.id), createPlant(site.id)]);
    const admin = await agentFor(app, 'admin');

    await admin.patch(`/plants/${other.id}`).send({ name: 'Other' }).expect(200);
    await admin.post(`/plants/${other.id}/inspections`).send({ items: allPassed }).expect(201);

    const res = await admin.get(`/plants/${plant.id}/history`).expect(200);
    expect((res.body as Page).total).toBe(0);
  });

  it('pages without overlap', async () => {
    const site = await createSite();
    const plant = await createPlant(site.id);
    const admin = await agentFor(app, 'admin');
    for (const name of ['A', 'B', 'C']) {
      await admin.patch(`/plants/${plant.id}`).send({ name }).expect(200);
    }
    const url = `/plants/${plant.id}/history`;

    const first = (await admin.get(`${url}?pageSize=2`).expect(200)).body as Page;
    const second = (await admin.get(`${url}?pageSize=2&page=2`).expect(200)).body as Page;

    const names = [...first.items, ...second.items].map((item) => item.changes.name?.to);
    expect(names).toEqual(['C', 'B', 'A']);
  });
});
