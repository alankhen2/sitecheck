import Fastify from 'fastify';
import { healthResponseSchema, type HealthResponse } from '@sitecheck/shared';

/**
 * Membuat instance Fastify tanpa listen, supaya bisa dipakai ulang
 * oleh server.ts dan oleh test (app.inject / Supertest) nanti.
 */
export function buildApp() {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });

  // Tidak ada yang di-await di sini, jadi handler-nya sync. Fastify tetap
  // mengirim nilai yang di-return. Handler yang memanggil database nanti baru memakai async.
  app.get('/health', (): HealthResponse => {
    return healthResponseSchema.parse({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  return app;
}
