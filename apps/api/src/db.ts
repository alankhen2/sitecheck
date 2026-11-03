import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env.');
}

// Prisma 7 talks to Postgres through a driver adapter (node-postgres here)
// instead of a bundled Rust engine.
const adapter = new PrismaPg({ connectionString });

export const prisma = new PrismaClient({ adapter });
