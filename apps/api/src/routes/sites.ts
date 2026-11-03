import {
  createSiteBodySchema,
  errorResponseSchema,
  idParamsSchema,
  siteSchema,
  updateSiteBodySchema,
} from '@sitecheck/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { SiteService } from '../services/sites.service.js';

/**
 * Anyone logged in can read sites; only an ADMIN can create, change or delete
 * them (sites are master data). Business errors (404/409) are thrown by the
 * service and turned into responses by the error handler in app.ts.
 */
export const siteRoutes: FastifyPluginAsyncZod<{ sites: SiteService }> = (app, { sites }) => {
  const loggedIn = app.authenticate;
  const adminOnly = app.requireRole('ADMIN');

  app.get(
    '/sites',
    { onRequest: loggedIn, schema: { response: { 200: z.array(siteSchema) } } },
    () => sites.list(),
  );

  app.get(
    '/sites/:id',
    {
      onRequest: loggedIn,
      schema: { params: idParamsSchema, response: { 200: siteSchema, 404: errorResponseSchema } },
    },
    (request) => sites.get(request.params.id),
  );

  app.post(
    '/sites',
    {
      onRequest: adminOnly,
      schema: { body: createSiteBodySchema, response: { 201: siteSchema } },
    },
    async (request, reply) => reply.code(201).send(await sites.create(request.body)),
  );

  app.patch(
    '/sites/:id',
    {
      onRequest: adminOnly,
      schema: {
        params: idParamsSchema,
        body: updateSiteBodySchema,
        response: { 200: siteSchema, 404: errorResponseSchema },
      },
    },
    (request) => sites.update(request.params.id, request.body),
  );

  app.delete(
    '/sites/:id',
    {
      onRequest: adminOnly,
      schema: {
        params: idParamsSchema,
        response: { 204: z.undefined(), 404: errorResponseSchema, 409: errorResponseSchema },
      },
    },
    async (request, reply) => {
      await sites.remove(request.params.id);
      return reply.code(204).send();
    },
  );

  return Promise.resolve();
};
