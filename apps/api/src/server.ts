import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { prisma } from './db.js';
import { createServices } from './services/index.js';

const config = loadConfig();
const app = await buildApp({ config, ...createServices(prisma) });

try {
  await app.listen({ port: config.PORT, host: config.HOST });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
