import type { PrismaClient } from '../generated/prisma/client.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { createInspectionRepository } from '../repositories/inspections.js';
import { createPlantRepository } from '../repositories/plants.js';
import { createSiteRepository } from '../repositories/sites.js';
import { createUserRepository } from '../repositories/users.js';
import { createAuthService } from './auth.service.js';
import { createInspectionService } from './inspections.service.js';
import { createPlantService } from './plants.service.js';
import { createSiteService } from './sites.service.js';

/**
 * The real services on top of Prisma. server.ts and the integration tests both
 * call this, so the tests exercise exactly the wiring that runs in production.
 * Unit tests use test-utils/app.ts instead, with in-memory repositories.
 */
export function createServices(prisma: PrismaClient) {
  const siteRepository = createSiteRepository(prisma);
  const plantRepository = createPlantRepository(prisma);
  return {
    auth: createAuthService({
      users: createUserRepository(prisma),
      hashPassword,
      verifyPassword,
    }),
    sites: createSiteService({ sites: siteRepository }),
    plants: createPlantService({ plants: plantRepository, sites: siteRepository }),
    inspections: createInspectionService({
      inspections: createInspectionRepository(prisma),
      plants: plantRepository,
    }),
  };
}
