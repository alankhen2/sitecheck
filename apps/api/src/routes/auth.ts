import {
  errorResponseSchema,
  loginBodySchema,
  publicUserSchema,
  registerBodySchema,
} from '@sitecheck/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { createAuthLimitHooks, type AuthLimits } from '../plugins/rate-limit.js';
import {
  EmailTakenError,
  InvalidCredentialsError,
  type AuthService,
} from '../services/auth.service.js';

// Route handlers only translate HTTP <-> service calls; the rules live in the service.
// `schema.body` validates the request, `schema.response` strips any field not in the schema.
export const authRoutes: FastifyPluginAsyncZod<{ auth: AuthService; limits: AuthLimits }> = async (
  app,
  { auth, limits },
) => {
  const limit = createAuthLimitHooks(limits);

  app.post(
    '/auth/register',
    {
      onRequest: limit.registerPerAddress,
      schema: {
        body: registerBodySchema,
        response: { 201: publicUserSchema, 409: errorResponseSchema, 429: errorResponseSchema },
      },
    },
    async (request, reply) => {
      try {
        const user = await auth.register(request.body);
        await reply.startSession(user.id);
        return await reply.code(201).send(user);
      } catch (err) {
        if (err instanceof EmailTakenError) {
          return reply.code(409).send({ message: 'Email is already registered' });
        }
        throw err;
      }
    },
  );

  app.post(
    '/auth/login',
    {
      // Both before the password check, so a refused attempt costs no hashing.
      onRequest: limit.loginPerAddress,
      preHandler: limit.loginPerAccount,
      schema: {
        body: loginBodySchema,
        response: { 200: publicUserSchema, 401: errorResponseSchema, 429: errorResponseSchema },
      },
    },
    async (request, reply) => {
      try {
        const user = await auth.login(request.body);
        await reply.startSession(user.id);
        return user;
      } catch (err) {
        if (err instanceof InvalidCredentialsError) {
          // Same message for unknown email and wrong password.
          return reply.code(401).send({ message: 'Invalid email or password' });
        }
        throw err;
      }
    },
  );

  app.post('/auth/logout', async (_request, reply) => {
    reply.endSession();
    return reply.code(204).send();
  });

  app.get(
    '/auth/me',
    {
      onRequest: app.authenticate,
      schema: { response: { 200: publicUserSchema, 401: errorResponseSchema } },
    },
    (request) => request.user,
  );

  return Promise.resolve();
};
