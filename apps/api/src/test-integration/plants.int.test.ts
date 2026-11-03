import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  agentFor,
  createInspection,
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

interface PlantPageBody {
  items: { id: string; name: string; status: string; nextInspectionAt: string | null }[];
  total: number;
  totalPages: number;
}

describe('create and update', () => {
  it('stores the next inspection date as the same instant across time zones', async () => {
    const site = await createSite();
    const inspector = await agentFor(app, 'inspector');

    const res = await inspector
      .post('/plants')
      .send({
        siteId: site.id,
        name: 'Lift',
        type: 'Forklift',
        serialNumber: 'TZ-1',
        nextInspectionAt: '2026-11-20T09:00:00+08:00',
      })
      .expect(201);

    expect((res.body as { nextInspectionAt: string }).nextInspectionAt).toBe(
      '2026-11-20T01:00:00.000Z',
    );
  });

  it('gives two simultaneous creates with one serial number a 201 and a 409', async () => {
    const site = await createSite();
    const [a, b] = await Promise.all(
      [1, 2].map(async () => {
        const inspector = await agentFor(app, 'inspector');
        return inspector
          .post('/plants')
          .send({ siteId: site.id, name: 'Lift', type: 'Forklift', serialNumber: 'RACE-1' });
      }),
    );

    expect([a?.status, b?.status].sort()).toEqual([201, 409]);
    // The loser may fail at the check or at the unique index; both carry the code.
    const loser = [a, b].find((res) => res?.status === 409);
    expect(loser?.body).toMatchObject({ code: 'SERIAL_NUMBER_TAKEN' });
    expect(await prisma.plant.count()).toBe(1);
  });

  it('refuses to move a plant to an inactive site', async () => {
    const site = await createSite();
    const closed = await createSite({ name: 'Closed', isActive: false });
    const plant = await createPlant(site.id);
    const admin = await agentFor(app, 'admin');

    await admin.patch(`/plants/${plant.id}`).send({ siteId: closed.id }).expect(409);

    const row = await prisma.plant.findUniqueOrThrow({ where: { id: plant.id } });
    expect(row.siteId).toBe(site.id);
  });
});

describe('delete', () => {
  it('refuses to delete a plant with inspection history, and keeps the history', async () => {
    const site = await createSite();
    const plant = await createPlant(site.id);
    const inspection = await createInspection(plant.id, seeded.inspector.id);
    const admin = await agentFor(app, 'admin');

    await admin.delete(`/plants/${plant.id}`).expect(409);

    expect(await prisma.inspection.findUnique({ where: { id: inspection.id } })).not.toBeNull();
  });

  it('deletes a plant with no inspections', async () => {
    const site = await createSite();
    const plant = await createPlant(site.id);
    const admin = await agentFor(app, 'admin');

    await admin.delete(`/plants/${plant.id}`).expect(204);

    expect(await prisma.plant.count()).toBe(0);
  });
});

describe('search, filter, sort and paging in Postgres', () => {
  async function list(query: string): Promise<PlantPageBody> {
    const inspector = await agentFor(app, 'inspector');
    const res = await inspector.get(`/plants?${query}`).expect(200);
    return res.body as PlantPageBody;
  }

  it('matches % and _ literally, not as LIKE wildcards', async () => {
    const site = await createSite();
    await createPlant(site.id, { name: 'Lift 100%' });
    await createPlant(site.id, { name: 'Lift 1000' });
    await createPlant(site.id, { name: 'Unit_A' });
    await createPlant(site.id, { name: 'UnitZA' });

    const percent = await list(`q=${encodeURIComponent('0%')}`);
    const underscore = await list('q=t_A');

    expect(percent.items.map((p) => p.name)).toEqual(['Lift 100%']);
    expect(underscore.items.map((p) => p.name)).toEqual(['Unit_A']);
  });

  it('searches serial numbers ignoring case', async () => {
    const site = await createSite();
    await createPlant(site.id, { name: 'Wanted', serialNumber: 'WGQ-EX-001' });
    await createPlant(site.id, { name: 'Other', serialNumber: 'PBT-CR-002' });

    const page = await list('q=wgq-ex');

    expect(page.items.map((p) => p.name)).toEqual(['Wanted']);
  });

  it('filters by several statuses from a repeated query parameter', async () => {
    const site = await createSite();
    await createPlant(site.id, { status: 'ACTIVE' });
    await createPlant(site.id, { status: 'REPAIR' });
    await createPlant(site.id, { status: 'INACTIVE' });

    const page = await list('status=REPAIR&status=INACTIVE');

    expect(page.items.map((p) => p.status).sort()).toEqual(['INACTIVE', 'REPAIR']);
  });

  it('sorts by next inspection, soonest first and no date last', async () => {
    const site = await createSite();
    await createPlant(site.id, { name: 'No date', nextInspectionAt: null });
    await createPlant(site.id, { name: 'Later', nextInspectionAt: new Date('2026-12-01') });
    await createPlant(site.id, { name: 'Overdue', nextInspectionAt: new Date('2026-10-20') });

    const page = await list('sort=nextInspectionAt');

    expect(page.items.map((p) => p.name)).toEqual(['Overdue', 'Later', 'No date']);
  });

  it('pages through equal names in id order, without repeating or skipping a plant', async () => {
    const site = await createSite();
    // Inserted with ids in DESCENDING order. Without the id tie-breaker Postgres
    // tends to return equal names in insertion order, which would pass a weaker
    // test by luck; here only an explicit ORDER BY ..., id gives ascending ids.
    const ids = Array.from(
      { length: 7 },
      (_, i) => `019a0000-0000-7000-8000-00000000090${String(7 - i)}`,
    );
    for (const id of ids) await createPlant(site.id, { id, name: 'Same Name' });

    const pages = [];
    for (const page of [1, 2, 3, 4]) pages.push(await list(`pageSize=2&page=${String(page)}`));
    const seen = pages.flatMap((p) => p.items.map((item) => item.id));

    expect(pages[0]).toMatchObject({ total: 7, totalPages: 4 });
    expect(seen).toEqual([...ids].sort());
  });
});
