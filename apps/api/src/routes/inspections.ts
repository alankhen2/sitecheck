import {
  createInspectionBodySchema,
  errorResponseSchema,
  idParamsSchema,
  inspectionPageSchema,
  inspectionSchema,
  listInspectionsQuerySchema,
} from '@sitecheck/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { InspectionService } from '../services/inspections.service.js';

/**
 * Anyone logged in can read the history. Admins and inspectors can record an
 * inspection. There is no update or delete: an inspection is evidence of what was
 * found on the day, so a correction is a new inspection.
 */
export const inspectionRoutes: FastifyPluginAsyncZod<{ inspections: InspectionService }> = (
  app,
  { inspections },
) => {
  app.get(
    '/plants/:id/inspections',
    {
      onRequest: app.authenticate,
      schema: {
        params: idParamsSchema,
        querystring: listInspectionsQuerySchema,
        response: { 200: inspectionPageSchema, 404: errorResponseSchema },
      },
    },
    (request) => inspections.listForPlant(request.params.id, request.query),
  );

  app.post(
    '/plants/:id/inspections',
    {
      onRequest: app.requireRole('ADMIN', 'INSPECTOR'),
      schema: {
        params: idParamsSchema,
        body: createInspectionBodySchema,
        response: {
          201: inspectionSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) =>
      reply
        .code(201)
        .send(await inspections.record(request.params.id, request.user.id, request.body)),
  );

  return Promise.resolve();
};
