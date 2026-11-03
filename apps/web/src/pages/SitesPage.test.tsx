import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Site } from '@sitecheck/shared';
import { dataHandlers, makePlant, testPlants, testSites } from '../test/data';
import { adminUser, authHandlers, inspectorUser } from '../test/fixtures';
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

describe('adding and editing sites', () => {
  it('lets an admin add a site, which then appears in the list', async () => {
    const data = dataHandlers();
    server.use(...data.handlers);
    const { user } = renderApp('/sites');
    await screen.findByRole('table', { name: 'Sites' });

    await user.click(screen.getByRole('button', { name: 'Add site' }));
    const dialog = screen.getByRole('dialog', { name: 'Add site' });
    expect(within(dialog).getByLabelText('Name')).toHaveFocus();
    await user.type(within(dialog).getByLabelText('Name'), '  Kwinana Yard ');
    await user.type(within(dialog).getByLabelText('Address'), '5 Rockingham Rd, Kwinana WA 6167');
    await user.click(within(dialog).getByRole('button', { name: 'Add site' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(rowNames()).toEqual(['Kwinana Yard', 'Port Botany Terminal 3', 'Westgate Quarry']);
    // Trimmed by the shared schema before sending; active unless unticked.
    expect(data.writes).toEqual([
      {
        method: 'POST',
        path: '/sites',
        body: { name: 'Kwinana Yard', address: '5 Rockingham Rd, Kwinana WA 6167', isActive: true },
      },
    ]);
  });

  it('shows field errors and sends nothing while the form is invalid', async () => {
    const data = dataHandlers();
    server.use(...data.handlers);
    const { user } = renderApp('/sites');
    await user.click(await screen.findByRole('button', { name: 'Add site' }));

    const dialog = screen.getByRole('dialog', { name: 'Add site' });
    await user.type(within(dialog).getByLabelText('Name'), '   ');
    await user.click(within(dialog).getByRole('button', { name: 'Add site' }));

    expect(await within(dialog).findByText('Enter a name of up to 120 characters.')).toBeVisible();
    expect(within(dialog).getByText('Enter an address of up to 300 characters.')).toBeVisible();
    expect(within(dialog).getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true');
    expect(data.writes).toEqual([]);
  });

  it('sends only the changed fields when editing', async () => {
    const data = dataHandlers();
    server.use(...data.handlers);
    const { user } = renderApp('/sites');

    await user.click(await screen.findByRole('button', { name: 'Edit Westgate Quarry' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit Westgate Quarry' });
    expect(within(dialog).getByLabelText('Address')).toHaveValue('120 Quarry Rd, Geelong VIC 3220');
    await user.click(within(dialog).getByLabelText('Active'));
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    const quarry = await screen.findByRole('row', { name: /Westgate Quarry.*Inactive/ });
    expect(quarry).toBeInTheDocument();
    expect(data.writes).toEqual([
      { method: 'PATCH', path: `/sites/${testSites[1]?.id ?? ''}`, body: { isActive: false } },
    ]);
  });

  it('closes without a request when nothing was changed', async () => {
    const data = dataHandlers();
    server.use(...data.handlers);
    const { user } = renderApp('/sites');

    await user.click(await screen.findByRole('button', { name: 'Edit Westgate Quarry' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(data.writes).toEqual([]);
  });

  it('keeps the form open with the server message when saving fails', async () => {
    server.use(...dataHandlers().handlers);
    // A later server.use() takes priority over earlier handlers.
    server.use(
      http.post(apiUrl('/sites'), () =>
        HttpResponse.json({ message: 'Forbidden' }, { status: 403 }),
      ),
    );
    const { user } = renderApp('/sites');
    await user.click(await screen.findByRole('button', { name: 'Add site' }));

    const dialog = screen.getByRole('dialog', { name: 'Add site' });
    await user.type(within(dialog).getByLabelText('Name'), 'Kwinana Yard');
    await user.type(within(dialog).getByLabelText('Address'), '5 Rockingham Rd');
    await user.click(within(dialog).getByRole('button', { name: 'Add site' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Forbidden');
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Kwinana Yard');
  });

  it('refreshes the plants list after a site is renamed', async () => {
    server.use(...dataHandlers().handlers);
    const { router, user } = renderApp('/plants');
    const stacker = await screen.findByRole('row', { name: /Kalmar Reach Stacker/ });
    expect(within(stacker).getByText('Port Botany Terminal 3')).toBeInTheDocument();

    await router.navigate('/sites');
    await user.click(await screen.findByRole('button', { name: 'Edit Port Botany Terminal 3' }));
    const name = screen.getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Port Botany T3');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    // Within staleTime the cached plants would be shown as they were; the
    // mutation marked them stale, so the page fetches them again.
    await router.navigate('/plants');
    const renamed = await screen.findByRole('row', { name: /Kalmar Reach Stacker/ });
    await waitFor(() => {
      expect(within(renamed).getByText('Port Botany T3')).toBeInTheDocument();
    });
  });

  it('does not offer add or edit to an inspector', async () => {
    server.use(authHandlers.loggedInAs(inspectorUser), ...dataHandlers().handlers);
    renderApp('/sites');

    await screen.findByRole('table', { name: 'Sites' });
    expect(screen.queryByRole('button', { name: 'Add site' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit/ })).not.toBeInTheDocument();
  });
});

describe('deleting sites', () => {
  const emptySite: Site = {
    id: '019a0000-0000-7000-8000-000000000003',
    name: 'Kwinana Yard',
    address: '5 Rockingham Rd, Kwinana WA 6167',
    isActive: false,
    plantCount: 0,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };

  it('deletes a site without plants after confirming', async () => {
    const data = dataHandlers(testPlants, [...testSites, emptySite]);
    server.use(...data.handlers);
    const { user } = renderApp('/sites');

    await user.click(await screen.findByRole('button', { name: 'Delete Kwinana Yard' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete Kwinana Yard?' });
    // The safe choice has the focus, so a stray Enter does not delete.
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Delete site' }));

    await waitFor(() => {
      expect(rowNames()).toEqual(['Port Botany Terminal 3', 'Westgate Quarry']);
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(data.writes).toEqual([{ method: 'DELETE', path: `/sites/${emptySite.id}`, body: null }]);
  });

  it('cancelling deletes nothing', async () => {
    const data = dataHandlers(testPlants, [...testSites, emptySite]);
    server.use(...data.handlers);
    const { user } = renderApp('/sites');

    await user.click(await screen.findByRole('button', { name: 'Delete Kwinana Yard' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(rowNames()).toContain('Kwinana Yard');
    expect(data.writes).toEqual([]);
  });

  it('explains instead of offering a delete when the site has plants', async () => {
    const data = dataHandlers();
    server.use(...data.handlers);
    const { router, user } = renderApp('/sites');

    await user.click(await screen.findByRole('button', { name: 'Delete Westgate Quarry' }));
    const dialog = screen.getByRole('dialog', { name: 'Cannot delete Westgate Quarry' });
    expect(within(dialog).getByRole('alert')).toHaveTextContent('This site still has plants.');
    expect(within(dialog).queryByRole('button', { name: 'Delete site' })).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('link', { name: 'View its plants' }));
    expect(currentUrl(router)).toBe(`/plants?siteId=${testSites[1]?.id ?? ''}`);
    expect(data.writes).toEqual([]);
  });

  it('gives the same explanation when the API says the site gained plants meanwhile', async () => {
    // The list says 0 plants, but the server has one at this site: a 409.
    const stale = { ...emptySite, isActive: true };
    const data = dataHandlers(
      [...testPlants, makePlant({ siteId: stale.id, siteName: stale.name })],
      [...testSites, stale],
    );
    server.use(...data.handlers);
    const { user } = renderApp('/sites');

    await user.click(await screen.findByRole('button', { name: 'Delete Kwinana Yard' }));
    await user.click(screen.getByRole('button', { name: 'Delete site' }));

    const dialog = await screen.findByRole('dialog', { name: 'Cannot delete Kwinana Yard' });
    expect(within(dialog).getByRole('alert')).toHaveTextContent('This site still has plants.');
    expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus();
  });

  it('shows other errors in the confirm dialog', async () => {
    server.use(...dataHandlers(testPlants, [...testSites, emptySite]).handlers);
    server.use(
      http.delete(apiUrl('/sites/:id'), () =>
        HttpResponse.json({ message: 'Site not found' }, { status: 404 }),
      ),
    );
    const { user } = renderApp('/sites');

    await user.click(await screen.findByRole('button', { name: 'Delete Kwinana Yard' }));
    await user.click(screen.getByRole('button', { name: 'Delete site' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Site not found');
  });

  it('does not offer delete to an inspector', async () => {
    server.use(authHandlers.loggedInAs(inspectorUser), ...dataHandlers().handlers);
    renderApp('/sites');

    await screen.findByRole('table', { name: 'Sites' });
    expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
  });
});
