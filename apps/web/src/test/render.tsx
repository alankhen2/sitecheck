import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { createQueryClient } from '../lib/query-client';
import { routes } from '../router';

/**
 * Renders the whole app (real routes, real QueryClient settings) at `path`,
 * the way a user would land on it. Returns the router to inspect the URL,
 * the query client, and a userEvent instance to click and type.
 */
export function renderApp(path: string) {
  const queryClient = createQueryClient();
  // Same retry rules as production, but without waiting between attempts.
  queryClient.setDefaultOptions({
    ...queryClient.getDefaultOptions(),
    queries: { ...queryClient.getDefaultOptions().queries, retryDelay: 0 },
  });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const user = userEvent.setup();

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return { router, queryClient, user };
}

/** Current path + query string of a memory router. */
export const currentUrl = (router: ReturnType<typeof renderApp>['router']) =>
  router.state.location.pathname + router.state.location.search;
