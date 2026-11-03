import Fastify from 'fastify';
import { healthResponseSchema, type HealthResponse } from '@sitecheck/shared';

/**
 * Membuat instance Fastify tanpa listen, supaya bisa dipakai ulang
 * oleh server.ts dan oleh test (app.inject / Supertest) nanti.
 */
export function buildApp() {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });

  app.get('/health', async (): Promise<HealthResponse> => {
    return healthResponseSchema.parse({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  return app;
}
