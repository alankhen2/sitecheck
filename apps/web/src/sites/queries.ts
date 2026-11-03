import { siteSchema } from '@sitecheck/shared';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch } from '../lib/api';

const siteListSchema = z.array(siteSchema);

export const siteKeys = {
  all: ['sites'] as const,
  list: () => ['sites', 'list'] as const,
};

/** Every site, sorted by name (the API's order). */
export function useSites() {
  return useQuery({
    queryKey: siteKeys.list(),
    queryFn: ({ signal }) => apiFetch('/sites', siteListSchema, { signal }),
  });
}
