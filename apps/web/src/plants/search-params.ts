import { listPlantsQuerySchema, type ListPlantsQuery } from '@sitecheck/shared';

/** The list query with every default filled in (sort by name, page 1, 20 rows). */
export const defaultPlantQuery: ListPlantsQuery = listPlantsQuerySchema.parse({});

/**
 * Reads the plant list filters from the URL with the same schema the API
 * uses. A broken value (a hand-edited `?page=abc`, an old bookmark with a
 * status that no longer exists) is dropped and falls back to its default,
 * instead of turning the whole page into an error.
 */
export function readPlantQuery(params: URLSearchParams): ListPlantsQuery {
  const status = params.getAll('status');
  const raw: Record<string, unknown> = {
    q: params.get('q') ?? undefined,
    status: status.length > 0 ? status : undefined,
    siteId: params.get('siteId') ?? undefined,
    sort: params.get('sort') ?? undefined,
    page: params.get('page') ?? undefined,
    pageSize: params.get('pageSize') ?? undefined,
  };

  const result = listPlantsQuerySchema.safeParse(raw);
  if (result.success) return result.data;

  const invalid = new Set(result.error.issues.map((issue) => String(issue.path[0])));
  const valid = Object.fromEntries(Object.entries(raw).filter(([key]) => !invalid.has(key)));
  return listPlantsQuerySchema.parse(valid);
}

/**
 * The query as URL parameters. Defaults are left out, so the plain list is
 * just /plants and a shared link only shows what someone actually chose.
 * The API applies the same defaults, so the same string serves both.
 */
export function plantQueryToParams(query: ListPlantsQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  for (const status of query.status ?? []) params.append('status', status);
  if (query.siteId) params.set('siteId', query.siteId);
  if (query.sort !== defaultPlantQuery.sort) params.set('sort', query.sort);
  if (query.page !== defaultPlantQuery.page) params.set('page', String(query.page));
  if (query.pageSize !== defaultPlantQuery.pageSize) {
    params.set('pageSize', String(query.pageSize));
  }
  return params;
}

/** True when the user has narrowed the list (search, status or site). */
export function hasFilters(query: ListPlantsQuery): boolean {
  return Boolean(query.q) || (query.status?.length ?? 0) > 0 || Boolean(query.siteId);
}
