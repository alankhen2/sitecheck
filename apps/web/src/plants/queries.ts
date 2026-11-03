import { plantPageSchema, type ListPlantsQuery } from '@sitecheck/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { plantQueryToParams } from './search-params';

/**
 * Cache keys for plant data. Everything starts with 'plants', so a later
 * change (add, edit, delete) can refresh every plant list at once with
 * invalidateQueries({ queryKey: plantKeys.all }).
 */
export const plantKeys = {
  all: ['plants'] as const,
  list: (query: ListPlantsQuery) => ['plants', 'list', query] as const,
};

/** One page of plants. Each filter combination is cached under its own key. */
export function usePlants(query: ListPlantsQuery) {
  return useQuery({
    queryKey: plantKeys.list(query),
    queryFn: ({ signal }) => {
      const search = plantQueryToParams(query).toString();
      return apiFetch(`/plants${search ? `?${search}` : ''}`, plantPageSchema, { signal });
    },
    // While the next page or filter loads, keep showing the current rows
    // (dimmed) instead of flashing an empty table.
    placeholderData: keepPreviousData,
  });
}
