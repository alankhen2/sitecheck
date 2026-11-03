import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { createQueryClient } from './lib/query-client';
import { routes } from './router';

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe('routes', () => {
  it('sends / to the plants page', async () => {
    const router = renderAt('/');

    expect(await screen.findByRole('heading', { name: 'Plants' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/plants');
  });

  it('marks the current page in the navigation', async () => {
    renderAt('/sites');

    expect(await screen.findByRole('link', { name: 'Sites' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('shows a not-found page for an unknown address', async () => {
    renderAt('/no-such-page');

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});
