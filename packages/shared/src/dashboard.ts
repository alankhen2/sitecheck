import { z } from 'zod';
import { plantSchema } from './plants.js';

/** A short list of the most urgent plants, and how many there are in all. */
const dueListSchema = z.object({
  items: z.array(plantSchema),
  total: z.number().int().nonnegative(),
});

export const dashboardSchema = z.object({
  counts: z.object({
    ACTIVE: z.number().int().nonnegative(),
    REPAIR: z.number().int().nonnegative(),
    INACTIVE: z.number().int().nonnegative(),
  }),
  overdue: dueListSchema,
  dueSoon: dueListSchema,
});
export type Dashboard = z.infer<typeof dashboardSchema>;
