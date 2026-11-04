import {
  createPlantBodySchema,
  errorResponseSchema,
  idParamsSchema,
  listPlantsQuerySchema,
  plantPageSchema,
  plantSchema,
  updatePlantBodySchema,
} from '@sitecheck/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { PlantService } from '../services/plants.service.js';

/**
 * Anyone logged in can read plants. Admins and inspectors can add and edit them
 * (inspectors find new equipment in the field); only an ADMIN can delete one.
 * Writes name both roles explicitly, so a future read-only role gets no write
 * access by default.
 */
export const plantRoutes: FastifyPluginAsyncZod<{ plants: PlantService }> = (app, { plants }) => {
  const loggedIn = app.authenticate;
  const staff = app.requireRole('ADMIN', 'INSPECTOR');
  const adminOnly = app.requireRole('ADMIN');

  const errors = {
    400: errorResponseSchema,
    404: errorResponseSchema,
    409: errorResponseSchema,
  };

  app.get(
    '/plants',
    {
      onRequest: loggedIn,
      schema: { querystring: listPlantsQuerySchema, response: { 200: plantPageSchema } },
    },
    (request) => plants.list(request.query),
  );

  app.get(
    '/plants/:id',
    {
      onRequest: loggedIn,
      schema: { params: idParamsSchema, response: { 200: plantSchema, 404: errorResponseSchema } },
    },
    (request) => plants.get(request.params.id),
  );

  app.post(
    '/plants',
    {
      onRequest: staff,
      schema: { body: createPlantBodySchema, response: { 201: plantSchema, ...errors } },
    },
    async (request, reply) =>
      reply.code(201).send(await plants.create(request.body, request.user.id)),
  );

  app.patch(
    '/plants/:id',
    {
      onRequest: staff,
      schema: {
        params: idParamsSchema,
        body: updatePlantBodySchema,
        response: { 200: plantSchema, ...errors },
      },
    },
    (request) => plants.update(request.params.id, request.body, request.user.id),
  );

  app.delete(
    '/plants/:id',
    {
      onRequest: adminOnly,
      schema: {
        params: idParamsSchema,
        response: { 204: z.undefined(), 404: errorResponseSchema, 409: errorResponseSchema },
      },
    },
    async (request, reply) => {
      await plants.remove(request.params.id, request.user.id);
      return reply.code(204).send();
    },
  );

  return Promise.resolve();
};
