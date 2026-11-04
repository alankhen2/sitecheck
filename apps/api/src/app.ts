import Fastify, { type FastifyError } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { healthResponseSchema, type HealthResponse } from '@sitecheck/shared';
import type { Config } from './config.js';
import { authPlugin } from './plugins/auth.js';
import { defaultAuthLimits, type AuthLimits } from './plugins/rate-limit.js';
import { auditRoutes } from './routes/audit.js';
import { authRoutes } from './routes/auth.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { inspectionRoutes } from './routes/inspections.js';
import { plantRoutes } from './routes/plants.js';
import { siteRoutes } from './routes/sites.js';
import type { AuditService } from './services/audit.service.js';
import type { AuthService } from './services/auth.service.js';
import type { DashboardService } from './services/dashboard.service.js';
import { DomainError, toErrorResponse } from './services/errors.js';
import type { InspectionService } from './services/inspections.service.js';
import type { PlantService } from './services/plants.service.js';
import type { SiteService } from './services/sites.service.js';

export interface AppDeps {
  config: Config;
  auth: AuthService;
  sites: SiteService;
  plants: PlantService;
  inspections: InspectionService;
  audit: AuditService;
  dashboard: DashboardService;
  /** Leave out for the real limits. */
  authLimits?: AuthLimits;
}

/**
 * Membuat instance Fastify tanpa listen, supaya bisa dipakai ulang
 * oleh server.ts dan oleh test (app.inject).
 * Dependensi (config, service) dimasukkan dari luar, jadi test bisa memakai
 * versi palsu tanpa database.
 */
export async function buildApp({
  config,
  auth,
  sites,
  plants,
  inspections,
  audit,
  dashboard,
  authLimits = defaultAuthLimits,
}: AppDeps) {
  const app = Fastify({
    logger: config.NODE_ENV !== 'test',
    // hop 0 is the connection itself, hop 1 the address it forwarded, and so on.
    trustProxy: (_address, hop) => hop < config.TRUST_PROXY,
  }).withTypeProvider<ZodTypeProvider>();

  // Zod schemas from packages/shared validate requests and shape responses.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.setErrorHandler<FastifyError>((error, request, reply) => {
    // Business-rule errors from services: their own status (404, 409, 400) and message.
    if (error instanceof DomainError) {
      return reply.code(error.statusCode).send(toErrorResponse(error));
    }
    // Fastify's own client errors (validation 400, payload too large 413, ...)
    // describe the request, so their message may be shown. The body is built
    // here so every error has one shape, { message, code? }: Fastify's default
    // body has its own `code` ("FST_ERR_VALIDATION"), which is not one of ours
    // and would fail a route's errorResponseSchema.
    if (error.statusCode !== undefined && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ message: error.message });
    }
    // Anything else is a bug or an outage. Fastify's default 500 would echo
    // error.message to the client, and a database error message can contain
    // hosts, SQL or credentials, so log the details and send a generic body.
    request.log.error(error);
    return reply.code(500).send({ message: 'Internal Server Error' });
  });

  await app.register(authPlugin, { config, auth });
  await app.register(authRoutes, { auth, limits: authLimits });
  await app.register(siteRoutes, { sites });
  await app.register(plantRoutes, { plants });
  await app.register(inspectionRoutes, { inspections });
  await app.register(auditRoutes, { audit });
  await app.register(dashboardRoutes, { dashboard });

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
