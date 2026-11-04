import {
  auditPageSchema,
  errorResponseSchema,
  idParamsSchema,
  listAuditQuerySchema,
} from '@sitecheck/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { AuditService } from '../services/audit.service.js';

/** Anyone logged in can read what happened to a plant. Nobody can write the log directly. */
export const auditRoutes: FastifyPluginAsyncZod<{ audit: AuditService }> = (app, { audit }) => {
  app.get(
    '/plants/:id/history',
    {
      onRequest: app.authenticate,
      schema: {
        params: idParamsSchema,
        querystring: listAuditQuerySchema,
        response: { 200: auditPageSchema, 404: errorResponseSchema },
      },
    },
    (request) => audit.historyForPlant(request.params.id, request.query),
  );

  return Promise.resolve();
};
