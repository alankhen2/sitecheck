import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

/**
 * A page number kept in the URL under `name`. Other params stay as they are, so
 * two paged lists on one page each keep their place. Anything that is not a
 * whole number from 1 up counts as page 1.
 */
export function usePageParam(name: string) {
  const [params, setParams] = useSearchParams();
  const asked = Number(params.get(name));
  const page = Number.isInteger(asked) && asked >= 1 ? asked : 1;

  const setPage = useCallback(
    (next: number) => {
      setParams((current) => {
        current.set(name, String(next));
        return current;
      });
    },
    [name, setParams],
  );

  return [page, setPage] as const;
}
