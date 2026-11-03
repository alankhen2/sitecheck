import {
  plantPageSchema,
  plantSchema,
  type CreatePlantBody,
  type ListPlantsQuery,
  type Plant,
  type UpdatePlantBody,
} from '@sitecheck/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiFetchEmpty } from '../lib/api';
import { siteKeys } from '../sites/keys';
import { plantKeys } from './keys';
import { plantQueryToParams } from './search-params';

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

/**
 * After any plant change, refresh every plant list and the site list: sites
 * show a plant count, which adding, moving or deleting a plant changes.
 * Returned from onSettled so the mutation stays pending until both are fresh
 * (see sites/queries.ts for why onSettled).
 */
function useRefreshAfterPlantChange() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: plantKeys.all }),
      queryClient.invalidateQueries({ queryKey: siteKeys.all }),
    ]);
}

export function useCreatePlant() {
  const refresh = useRefreshAfterPlantChange();
  return useMutation({
    mutationFn: (body: CreatePlantBody) =>
      apiFetch('/plants', plantSchema, { method: 'POST', body }),
    onSettled: refresh,
  });
}

export function useUpdatePlant() {
  const refresh = useRefreshAfterPlantChange();
  return useMutation({
    mutationFn: ({ id, changes }: { id: Plant['id']; changes: UpdatePlantBody }) =>
      apiFetch(`/plants/${id}`, plantSchema, { method: 'PATCH', body: changes }),
    onSettled: refresh,
  });
}

export function useDeletePlant() {
  const refresh = useRefreshAfterPlantChange();
  return useMutation({
    mutationFn: (id: Plant['id']) => apiFetchEmpty(`/plants/${id}`, { method: 'DELETE' }),
    onSettled: refresh,
  });
}
