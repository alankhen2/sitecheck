import type { ListPlantsQuery } from '@sitecheck/shared';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { plantQueryToParams, readPlantQuery } from './search-params';

type Changes = Partial<ListPlantsQuery>;

/**
 * The plant list filters, kept in the URL. Returns the current query and a
 * function to change it. Any change goes back to page 1 unless it sets a page,
 * because page 4 of the old results means nothing for a new filter.
 *
 * `replace: true` rewrites the current history entry instead of adding one:
 * used while typing a search, so Back does not step through every keystroke.
 */
export function usePlantQuery() {
  const [params, setParams] = useSearchParams();
  const query = useMemo(() => readPlantQuery(params), [params]);

  const update = useCallback(
    (changes: Changes, { replace = false }: { replace?: boolean } = {}) => {
      const next = { ...query, page: 1, ...changes };
      setParams(plantQueryToParams(next), { replace });
    },
    [query, setParams],
  );

  return [query, update] as const;
}
