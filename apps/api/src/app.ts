import Fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { healthResponseSchema, type HealthResponse } from '@sitecheck/shared';
import type { Config } from './config.js';
import { authPlugin } from './plugins/auth.js';
import { authRoutes } from './routes/auth.js';
import type { AuthService } from './services/auth.service.js';

export interface AppDeps {
  config: Config;
  auth: AuthService;
}

/**
 * Membuat instance Fastify tanpa listen, supaya bisa dipakai ulang
 * oleh server.ts dan oleh test (app.inject).
 * Dependensi (config, service) dimasukkan dari luar, jadi test bisa memakai
 * versi palsu tanpa database.
 */
export async function buildApp({ config, auth }: AppDeps) {
  const app = Fastify({ logger: config.NODE_ENV !== 'test' }).withTypeProvider<ZodTypeProvider>();

  // Zod schemas from packages/shared validate requests and shape responses.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(authPlugin, { config, auth });
  await app.register(authRoutes, { auth });

  // Tidak ada yang di-await di sini, jadi handler-nya sync. Fastify tetap
  // mengirim nilai yang di-return.
  app.get('/health', (): HealthResponse => {
    return healthResponseSchema.parse({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  return app;
}
