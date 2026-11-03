import { z } from 'zod';

/**
 * Response shape of GET /health.
 * Contoh skema bersama: api memakainya untuk membentuk respons,
 * web memakainya untuk memvalidasi data yang diterima.
 */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  uptime: z.number().nonnegative(),
  timestamp: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
