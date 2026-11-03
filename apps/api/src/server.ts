import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { prisma } from './db.js';
import { hashPassword, verifyPassword } from './lib/password.js';
import { createPlantRepository } from './repositories/plants.js';
import { createSiteRepository } from './repositories/sites.js';
import { createUserRepository } from './repositories/users.js';
import { createAuthService } from './services/auth.service.js';
import { createPlantService } from './services/plants.service.js';
import { createSiteService } from './services/sites.service.js';

// The one place real dependencies are wired together; tests wire fakes instead.
const config = loadConfig();
const auth = createAuthService({
  users: createUserRepository(prisma),
  hashPassword,
  verifyPassword,
});

const siteRepository = createSiteRepository(prisma);
const sites = createSiteService({ sites: siteRepository });
const plants = createPlantService({
  plants: createPlantRepository(prisma),
  sites: siteRepository,
});

const app = await buildApp({ config, auth, sites, plants });

try {
  await app.listen({ port: config.PORT, host: config.HOST });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
