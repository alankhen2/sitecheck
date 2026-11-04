/**
 * The real API on a database made fresh for this run, for the Playwright tests:
 * drops and recreates it, applies every migration, adds the demo data, then starts
 * the same server as production. Each run therefore starts from the same data.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { databaseName } from '../test-integration/database-url.js';
import { assertE2eDatabase } from './database.js';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function recreateDatabase(url: string): Promise<void> {
  const name = databaseName(url);
  // Connect to the server's maintenance database, since a database cannot drop itself.
  const admin = new URL(url);
  admin.pathname = '/postgres';
  admin.search = '';
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: admin.toString() }),
  });
  try {
    // Identifiers cannot be bound parameters. assertE2eDatabase allows only
    // [a-z0-9_] in `name`, so quoting it is safe.
    await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await prisma.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  } finally {
    await prisma.$disconnect();
  }
}

/** The Prisma CLI's JS entry, run with this Node: no shell, works the same on Windows. */
function prismaCli(...args: string[]): void {
  execFileSync(
    process.execPath,
    [path.join(apiRoot, 'node_modules/prisma/build/index.js'), ...args],
    {
      cwd: apiRoot,
      stdio: 'inherit',
    },
  );
}

const url = process.env.DATABASE_URL ?? '';
assertE2eDatabase(url);

await recreateDatabase(url);
prismaCli('migrate', 'deploy');
prismaCli('db', 'seed');

// Imported only now: importing it starts the server.
await import('../server.js');
