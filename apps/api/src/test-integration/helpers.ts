import { randomBytes, scryptSync } from 'node:crypto';
import supertest from 'supertest';
import { buildApp } from '../app.js';
import { loadConfig, type Config } from '../config.js';
import { prisma } from '../db.js';
import { createServices } from '../services/index.js';
import { assertTestDatabase } from './database-url.js';

export { prisma };

/** The production app (real services, real Prisma) on the test database. */
export async function startApp(config: Partial<Config> = {}) {
  const app = await buildApp({
    config: { ...loadConfig(), ...config },
    ...createServices(prisma),
    // Tests log in over and over from one address. rate-limit.int.test.ts uses the real limits.
    authLimits: {
      loginPerAccount: 100_000,
      loginPerAddress: 100_000,
      registerPerAddress: 100_000,
    },
  });
  await app.ready();
  // supertest sends real HTTP requests to the app's server over a socket.
  return { app, http: supertest(app.server) };
}

export type IntegrationApp = Awaited<ReturnType<typeof startApp>>;

/** Empties every table except Prisma's migration history. */
export async function resetDatabase(): Promise<void> {
  assertTestDatabase(process.env.DATABASE_URL ?? '');
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`);
}

/**
 * A scrypt hash in the same format as lib/password.ts, but with N = 2^10 instead
 * of 2^17. verifyPassword reads N from the stored hash, so login still runs the
 * real verification code, in about a millisecond instead of half a second.
 * Test fixtures only: never use a cost this low for real passwords.
 */
function fastHash(password: string): string {
  const N = 2 ** 10;
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 64, { N, r: 8, p: 1 });
  return ['scrypt', N, 8, 1, salt.toString('base64'), key.toString('base64')].join('$');
}

export const users = {
  admin: { name: 'Alex Admin', email: 'admin@test.dev', password: 'admin password 123' },
  inspector: { name: 'Ivy Inspector', email: 'ivy@test.dev', password: 'inspector password 1' },
  viewer: { name: 'Vic Viewer', email: 'vic@test.dev', password: 'viewer password 12' },
} as const;

export async function seedUsers() {
  const [admin, inspector, viewer] = await Promise.all([
    prisma.user.create({
      data: { ...pick(users.admin), role: 'ADMIN', passwordHash: fastHash(users.admin.password) },
    }),
    prisma.user.create({
      data: {
        ...pick(users.inspector),
        role: 'INSPECTOR',
        passwordHash: fastHash(users.inspector.password),
      },
    }),
    prisma.user.create({
      data: {
        ...pick(users.viewer),
        role: 'VIEWER',
        passwordHash: fastHash(users.viewer.password),
      },
    }),
  ]);
  return { admin, inspector, viewer };
}

const pick = ({ name, email }: { name: string; email: string }) => ({ name, email });

/**
 * A supertest agent keeps cookies between requests like a browser, so after
 * this call every request it sends carries the session cookie.
 */
export async function agentFor(app: IntegrationApp['app'], who: keyof typeof users) {
  const agent = supertest.agent(app.server);
  const { email, password } = users[who];
  await agent.post('/auth/login').send({ email, password }).expect(200);
  return agent;
}

let serial = 0;

/** Inserts a site directly (not through the API), for arranging test data. */
export function createSite(overrides: { name?: string; isActive?: boolean } = {}) {
  return prisma.site.create({
    data: { name: 'Westgate Quarry', address: '120 Quarry Rd', isActive: true, ...overrides },
  });
}

/** Inserts a plant directly. Serial numbers are unique per call unless given. */
export function createPlant(
  siteId: string,
  overrides: {
    id?: string;
    name?: string;
    type?: string;
    serialNumber?: string;
    status?: 'ACTIVE' | 'REPAIR' | 'INACTIVE';
    nextInspectionAt?: Date | null;
  } = {},
) {
  serial += 1;
  return prisma.plant.create({
    data: {
      siteId,
      name: 'CAT 336 Excavator',
      type: 'Excavator',
      serialNumber: `INT-${String(serial).padStart(4, '0')}`,
      ...overrides,
    },
  });
}

/** Inserts an inspection directly, for arranging test data. It has no effect on the plant. */
export function createInspection(plantId: string, inspectorId: string) {
  return prisma.inspection.create({ data: { plantId, inspectorId, result: 'PASS' } });
}
