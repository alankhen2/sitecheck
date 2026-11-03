import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { databaseName, testDatabaseUrl } from './database-url.js';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Runs once before all integration test files: creates the test database if it
 * does not exist, then applies every committed migration to it. Applying them
 * from scratch also proves the migrations work on an empty database.
 */
export default async function setup(): Promise<void> {
  // Computed again rather than read from DATABASE_URL: in this (main) process
  // DATABASE_URL is still the dev database loaded from .env. testDatabaseUrl()
  // also throws unless the name ends with _test.
  const url = testDatabaseUrl();

  await createDatabaseIfMissing(url);

  // The Prisma CLI's JS entry, run with this Node: no shell, works the same on Windows.
  execFileSync(
    process.execPath,
    [path.join(apiRoot, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
    { cwd: apiRoot, env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' },
  );
}

async function createDatabaseIfMissing(url: string): Promise<void> {
  const name = databaseName(url);
  // Connect to the server's maintenance database to create ours.
  const admin = new URL(url);
  admin.pathname = '/postgres';
  admin.search = '';
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: admin.toString() }),
  });
  try {
    const rows = await prisma.$queryRaw<
      unknown[]
    >`SELECT 1 FROM pg_database WHERE datname = ${name}`;
    if (rows.length === 0) {
      // Identifiers cannot be bound parameters. `name` matched /^[a-z0-9_]+_test$/
      // in assertTestDatabase, so quoting it is safe.
      await prisma.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
