import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { dataHandlers, testSites } from '../test/data';
import { adminUser, authHandlers } from '../test/fixtures';
import { currentUrl, renderApp } from '../test/render';
import { apiUrl, server } from '../test/server';

beforeEach(() => {
  server.use(authHandlers.loggedInAs(adminUser));
});

/** Site names in the table, top to bottom. */
function rowNames(): string[] {
  const table = screen.getByRole('table', { name: 'Sites' });
  return within(table)
    .getAllByRole('rowheader')
    .map((cell) => cell.textContent);
}

describe('sites page', () => {
  it('lists every site with its plant count and status', async () => {
    server.use(...dataHandlers().handlers);
    renderApp('/sites');

    expect(await screen.findByRole('table', { name: 'Sites' })).toBeInTheDocument();
    expect(rowNames()).toEqual(['Port Botany Terminal 3', 'Westgate Quarry']);

    const quarry = screen.getByRole('row', { name: /Westgate Quarry/ });
    expect(within(quarry).getByText('120 Quarry Rd, Geelong VIC 3220')).toBeInTheDocument();
    expect(within(quarry).getByText('2 plants')).toBeInTheDocument();
    expect(within(quarry).getByText('Active')).toBeInTheDocument();
  });

  it('opens the plants page filtered to a site from its plant count', async () => {
    server.use(...dataHandlers().handlers);
    const { router, user } = renderApp('/sites');

    await user.click(
      await screen.findByRole('link', { name: '1 plant at Port Botany Terminal 3' }),
    );

    expect(await screen.findByRole('heading', { name: 'Plants' })).toBeInTheDocument();
    expect(currentUrl(router)).toBe(`/plants?siteId=${testSites[0]?.id ?? ''}`);
  });

  it('says so when there are no sites', async () => {
    server.use(...dataHandlers([], []).handlers);
    renderApp('/sites');

    expect(await screen.findByText('No sites yet.')).toBeInTheDocument();
  });

  it('shows the error with a retry when loading fails', async () => {
    let fail = true;
    server.use(
      http.get(apiUrl('/sites'), () =>
        fail
          ? HttpResponse.json({ message: 'down' }, { status: 503 })
          : HttpResponse.json(testSites),
      ),
    );
    const { user } = renderApp('/sites');

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load sites.');
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('table', { name: 'Sites' })).toBeInTheDocument();
  });
});
