import { afterAll, beforeEach, describe, expect, it } from 'vitest';
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

describe('sites', () => {
  it('creates, reads, updates and deletes through the API', async () => {
    const admin = await agentFor(app, 'admin');

    const created = await admin
      .post('/sites')
      .send({ name: 'North Depot', address: '9 Depot Rd' })
      .expect(201);
    const id = (created.body as { id: string }).id;

    await admin.get(`/sites/${id}`).expect(200);
    const updated = await admin.patch(`/sites/${id}`).send({ isActive: false }).expect(200);
    await admin.delete(`/sites/${id}`).expect(204);
    await admin.get(`/sites/${id}`).expect(404);

    expect(updated.body).toMatchObject({ name: 'North Depot', isActive: false });
    expect(await prisma.site.count()).toBe(0);
  });

  it('counts plants per site in the list', async () => {
    const quarry = await createSite({ name: 'Quarry' });
    await createSite({ name: 'Yard' });
    await createPlant(quarry.id);
    await createPlant(quarry.id);
    const inspector = await agentFor(app, 'inspector');

    const res = await inspector.get('/sites').expect(200);

    expect(res.body).toEqual([
      expect.objectContaining({ name: 'Quarry', plantCount: 2 }),
      expect.objectContaining({ name: 'Yard', plantCount: 0 }),
    ]);
  });

  it('does not reactivate a site when a PATCH only renames it', async () => {
    const site = await createSite({ isActive: false });
    const admin = await agentFor(app, 'admin');

    await admin.patch(`/sites/${site.id}`).send({ name: 'Renamed' }).expect(200);

    const row = await prisma.site.findUniqueOrThrow({ where: { id: site.id } });
    expect(row).toMatchObject({ name: 'Renamed', isActive: false });
  });

  it('refuses to delete a site that has plants, and keeps both', async () => {
    const site = await createSite();
    await createPlant(site.id);
    const admin = await agentFor(app, 'admin');

    const res = await admin.delete(`/sites/${site.id}`).expect(409);

    expect(res.body).toEqual({
      message: 'Site still has plants; move or delete them first',
      code: 'SITE_HAS_PLANTS',
    });
    expect(await prisma.plant.count()).toBe(1);
  });
});
