import { siteSchema, type CreateSiteBody, type Site, type UpdateSiteBody } from '@sitecheck/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch } from '../lib/api';
import { plantKeys } from '../plants/queries';

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

/*
 * After a change, the cached lists are out of date. Rather than editing the
 * cache by hand (and copying the server's sorting and counting rules into the
 * browser), mark them stale: lists on screen refetch now, the rest next time
 * they are shown. Returning the promise from onSettled keeps the mutation
 * "pending" until the fresh list has arrived, so a dialog closes onto
 * up-to-date data. onSettled (not onSuccess) also refreshes after an error,
 * e.g. a site someone else deleted in the meantime.
 */

export function useCreateSite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSiteBody) => apiFetch('/sites', siteSchema, { method: 'POST', body }),
    // A new site has no plants, so only the site lists (this page and the
    // site filter on the plants page) change.
    onSettled: () => queryClient.invalidateQueries({ queryKey: siteKeys.all }),
  });
}

export function useUpdateSite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, changes }: { id: Site['id']; changes: UpdateSiteBody }) =>
      apiFetch(`/sites/${id}`, siteSchema, { method: 'PATCH', body: changes }),
    // Plant rows show the site's name, so a rename makes them stale too.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: siteKeys.all }),
        queryClient.invalidateQueries({ queryKey: plantKeys.all }),
      ]),
  });
}
