import {
  inspectionPageSchema,
  inspectionSchema,
  type CreateInspectionBody,
  type Plant,
} from '@sitecheck/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { plantKeys } from '../plants/keys';

export const HISTORY_PAGE_SIZE = 10;

/** One page of a plant's inspections, newest first. */
export function useInspections(plantId: Plant['id'], page: number) {
  return useQuery({
    queryKey: plantKeys.inspections(plantId, page),
    queryFn: ({ signal }) =>
      apiFetch(
        `/plants/${plantId}/inspections?page=${String(page)}&pageSize=${String(HISTORY_PAGE_SIZE)}`,
        inspectionPageSchema,
        { signal },
      ),
    placeholderData: keepPreviousData,
  });
}

/**
 * An inspection can change the plant's status and schedule, so every plant
 * query is refreshed: this plant, its history and the lists. Returned from
 * onSettled so the mutation stays pending until they are fresh, and the page
 * shown after saving already has the new status.
 */
export function useRecordInspection(plantId: Plant['id']) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateInspectionBody) =>
      apiFetch(`/plants/${plantId}/inspections`, inspectionSchema, { method: 'POST', body }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: plantKeys.all }),
  });
}
