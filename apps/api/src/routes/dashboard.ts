import { dashboardSchema } from '@sitecheck/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { DashboardService } from '../services/dashboard.service.js';

/** Anyone logged in can see the overview. */
export const dashboardRoutes: FastifyPluginAsyncZod<{ dashboard: DashboardService }> = (
  app,
  { dashboard },
) => {
  app.get(
    '/dashboard',
    { onRequest: app.authenticate, schema: { response: { 200: dashboardSchema } } },
    () => dashboard.summary(),
  );

  return Promise.resolve();
};
