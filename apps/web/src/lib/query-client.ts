import { QueryClient } from '@tanstack/react-query';
import { ApiError, UnexpectedResponseError } from './api';

/**
 * Retry only what another attempt could fix: a network failure or a 5xx.
 * A 4xx (401 not logged in, 403, 404, 400) or a response of the wrong shape
 * will be the same the next time, so retrying only delays the error message.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (error instanceof UnexpectedResponseError) return false;
  if (error instanceof ApiError) return error.status === 0 || error.status >= 500;
  return true;
}

/** A function, not a module-level client, so each test gets a fresh cache. */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Data younger than 30 s is shown without refetching (e.g. when going
        // back to a page). Older data is shown at once and refreshed behind it.
        staleTime: 30_000,
        retry: shouldRetry,
      },
      // A failed save is shown to the user, never silently repeated.
      mutations: { retry: false },
    },
  });
}
