import { randomBytes, scryptSync } from 'node:crypto';
import supertest from 'supertest';
import { buildApp } from '../app.js';
import { loadConfig } from '../config.js';
import { prisma } from '../db.js';
import { createServices } from '../services/index.js';
import { assertTestDatabase } from './database-url.js';

export { prisma };

/** The production app (real services, real Prisma) on the test database. */
export async function startApp() {
  const app = await buildApp({ config: loadConfig(), ...createServices(prisma) });
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
} as const;

export async function seedUsers() {
  const [admin, inspector] = await Promise.all([
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
  ]);
  return { admin, inspector };
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
