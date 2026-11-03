import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { databaseName } from './database-url.js';
import { prisma, resetDatabase, seedUsers, startApp, users } from './helpers.js';

const { app, http } = await startApp();

beforeEach(async () => {
  await resetDatabase();
  await seedUsers();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('integration setup', () => {
  it('runs against a *_test database with every migration applied', async () => {
    const [{ current }] = await prisma.$queryRaw<
      [{ current: string }]
    >`SELECT current_database() AS current`;
    const pending = await prisma.$queryRaw<unknown[]>`
      SELECT 1 FROM _prisma_migrations WHERE finished_at IS NULL`;

    expect(current).toMatch(/_test$/);
    expect(databaseName(process.env.DATABASE_URL ?? '')).toBe(current);
    expect(pending).toHaveLength(0);
  });

  it('starts each test from the same data', async () => {
    expect(await prisma.user.count()).toBe(2);
    expect(await prisma.site.count()).toBe(0);
  });

  it('serves real HTTP and logs in with the real password check', async () => {
    await http.get('/health').expect(200);

    const res = await http
      .post('/auth/login')
      .send({ email: users.admin.email, password: users.admin.password })
      .expect(200);

    expect(res.headers['set-cookie']?.[0]).toMatch(
      /^sitecheck_session=.+HttpOnly; SameSite=Strict/,
    );
  });
});
