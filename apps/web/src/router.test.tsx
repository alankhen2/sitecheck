import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { adminUser, authHandlers } from './test/fixtures';
import { currentUrl, renderApp } from './test/render';
import { server } from './test/server';

describe('routes', () => {
  it('sends / to the plants page', async () => {
    server.use(authHandlers.loggedInAs(adminUser));
    const { router } = renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Plants' })).toBeInTheDocument();
    expect(currentUrl(router)).toBe('/plants');
  });

  it('marks the current page in the navigation', async () => {
    server.use(authHandlers.loggedInAs(adminUser));
    renderApp('/sites');

    expect(await screen.findByRole('link', { name: 'Sites' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('shows a not-found page for an unknown address, without needing a login', async () => {
    renderApp('/no-such-page');

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});
