import supertest from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { loadConfig } from '../config.js';
import { createServices } from '../services/index.js';
import { prisma, resetDatabase, seedUsers, users } from './helpers.js';

// The production wiring with the real limits. The other integration files raise
// them, because they log in over and over from one address.
const app = await buildApp({ config: loadConfig(), ...createServices(prisma) });
await app.ready();

beforeEach(async () => {
  await resetDatabase();
  await seedUsers();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('logging in over real HTTP', () => {
  it('stops after 5 attempts, also for the right password, and starts no session', async () => {
    const { email, password } = users.inspector;
    const http = supertest(app.server);
    const login = (body: object) => http.post('/auth/login').send(body);

    for (let i = 0; i < 5; i += 1) {
      await login({ email, password: 'wrong password' }).expect(401);
    }
    const res = await login({ email, password }).expect(429);

    expect(res.body).toMatchObject({ code: 'RATE_LIMITED' });
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(res.headers['set-cookie']).toBeUndefined();

    // Another account from this address is still fine.
    await login({ email: users.admin.email, password: users.admin.password }).expect(200);
  });
});
