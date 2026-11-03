import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { dataHandlers, makePlant, testPlants, testSites } from '../test/data';
import { adminUser, authHandlers } from '../test/fixtures';
import { currentUrl, renderApp } from '../test/render';
import { apiUrl, server } from '../test/server';

beforeEach(() => {
  server.use(authHandlers.loggedInAs(adminUser));
});

/** Plant names in the table, top to bottom. */
function rowNames(): string[] {
  const table = screen.getByRole('table', { name: 'Plants' });
  return within(table)
    .getAllByRole('rowheader')
    .map((cell) => cell.firstChild?.textContent ?? '');
}

describe('plants page', () => {
  it('lists plants with status and inspection state', async () => {
    server.use(...dataHandlers().handlers);
    renderApp('/plants');

    expect(await screen.findByText('Showing 1–3 of 3 plants')).toBeInTheDocument();
    expect(rowNames()).toEqual([
      'CAT 336 Excavator',
      'Kalmar Reach Stacker',
      'Komatsu WA480 Loader',
    ]);

    const loader = screen.getByRole('row', { name: /Komatsu WA480 Loader/ });
    expect(within(loader).getByText('Repair')).toBeInTheDocument();
    expect(within(loader).getByText('Overdue')).toBeInTheDocument();
    const stacker = screen.getByRole('row', { name: /Kalmar Reach Stacker/ });
    expect(within(stacker).getByText('Not scheduled')).toBeInTheDocument();
  });

  it('searches after typing pauses, with one request, and puts the search in the URL', async () => {
    const data = dataHandlers();
    server.use(...data.handlers);
    const { router, user } = renderApp('/plants');
    await screen.findByText('Showing 1–3 of 3 plants');

    await user.type(screen.getByLabelText('Search plants'), 'komatsu');

    await waitFor(() => {
      expect(rowNames()).toEqual(['Komatsu WA480 Loader']);
    });
    expect(currentUrl(router)).toBe('/plants?q=komatsu');
    const searches = data.requests.filter((url) => url.searchParams.has('q'));
    expect(searches.map((url) => url.searchParams.get('q'))).toEqual(['komatsu']);
  });

  it('filters by several statuses with toggle buttons', async () => {
    const data = dataHandlers();
    server.use(...data.handlers);
    const { router, user } = renderApp('/plants');
    await screen.findByText('Showing 1–3 of 3 plants');

    await user.click(screen.getByRole('button', { name: 'Repair' }));
    await user.click(screen.getByRole('button', { name: 'Inactive' }));

    await waitFor(() => {
      expect(rowNames()).toEqual(['Kalmar Reach Stacker', 'Komatsu WA480 Loader']);
    });
    expect(screen.getByRole('button', { name: 'Repair' })).toHaveAttribute('aria-pressed', 'true');
    expect(currentUrl(router)).toBe('/plants?status=REPAIR&status=INACTIVE');
  });

  it('filters by site and sorts by next inspection', async () => {
    server.use(...dataHandlers().handlers);
    const { router, user } = renderApp('/plants');
    await screen.findByText('Showing 1–3 of 3 plants');

    await user.selectOptions(screen.getByLabelText('Sort'), 'Next inspection');
    await waitFor(() => {
      // Overdue first, then the later date, then the plant with no date.
      expect(rowNames()).toEqual([
        'Komatsu WA480 Loader',
        'CAT 336 Excavator',
        'Kalmar Reach Stacker',
      ]);
    });

    await user.selectOptions(screen.getByLabelText('Site'), 'Port Botany Terminal 3');
    await waitFor(() => {
      expect(rowNames()).toEqual(['Kalmar Reach Stacker']);
    });
    expect(currentUrl(router)).toBe(
      `/plants?siteId=${testSites[0]?.id ?? ''}&sort=nextInspectionAt`,
    );
  });

  it('pages through results, and Back returns to the previous page', async () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      makePlant({ name: `Lift ${String(i + 1).padStart(2, '0')}` }),
    );
    server.use(...dataHandlers(many).handlers);
    const { router, user } = renderApp('/plants');
    await screen.findByText('Showing 1–20 of 25 plants');

    await user.click(screen.getByRole('button', { name: /Next/ }));

    expect(await screen.findByText('Showing 21–25 of 25 plants')).toBeInTheDocument();
    expect(rowNames()[0]).toBe('Lift 21');
    expect(screen.getByRole('button', { name: /Next/ })).toBeDisabled();
    expect(currentUrl(router)).toBe('/plants?page=2');

    await router.navigate(-1);
    expect(await screen.findByText('Showing 1–20 of 25 plants')).toBeInTheDocument();
  });

  it('resets to page 1 when a filter changes', async () => {
    const many = Array.from({ length: 25 }, () => makePlant({ status: 'REPAIR' }));
    server.use(...dataHandlers(many).handlers);
    const { router, user } = renderApp('/plants?page=2');
    await screen.findByText('Showing 21–25 of 25 plants');

    await user.click(screen.getByRole('button', { name: 'Repair' }));

    await waitFor(() => {
      expect(currentUrl(router)).toBe('/plants?status=REPAIR');
    });
  });

  it('opens directly from a shared link with filters', async () => {
    server.use(...dataHandlers().handlers);
    renderApp('/plants?q=kalmar&status=INACTIVE');

    expect(await screen.findByText('Showing 1–1 of 1 plants')).toBeInTheDocument();
    expect(screen.getByLabelText('Search plants')).toHaveValue('kalmar');
    expect(screen.getByRole('button', { name: 'Inactive' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('ignores broken values in the URL instead of failing', async () => {
    const data = dataHandlers();
    server.use(...data.handlers);
    renderApp('/plants?page=abc&status=BROKEN&sort=passwordHash');

    expect(await screen.findByText('Showing 1–3 of 3 plants')).toBeInTheDocument();
    expect(data.requests[0]?.search).toBe('');
  });
});

describe('empty and error states', () => {
  it('offers to clear filters when nothing matches', async () => {
    server.use(...dataHandlers().handlers);
    const { router, user } = renderApp('/plants?q=nothing-like-this');

    expect(await screen.findByText('No plants match these filters.')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Clear filters' }));

    expect(await screen.findByText('Showing 1–3 of 3 plants')).toBeInTheDocument();
    expect(currentUrl(router)).toBe('/plants');
    expect(screen.getByLabelText('Search plants')).toHaveValue('');
  });

  it('says so when there are no plants at all', async () => {
    server.use(...dataHandlers([]).handlers);
    renderApp('/plants');

    expect(await screen.findByText('No plants yet.')).toBeInTheDocument();
    expect(screen.queryByText('Clear filters')).not.toBeInTheDocument();
  });

  it('handles a page past the end, e.g. from an old bookmark', async () => {
    server.use(...dataHandlers().handlers);
    const { router, user } = renderApp('/plants?page=9');

    expect(await screen.findByText('This page is empty.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Go to the first page' }));

    expect(await screen.findByText('Showing 1–3 of 3 plants')).toBeInTheDocument();
    expect(currentUrl(router)).toBe('/plants');
  });

  it('shows the error with a retry when loading fails', async () => {
    let fail = true;
    const data = dataHandlers();
    server.use(
      data.sites,
      http.get(apiUrl('/plants'), () =>
        fail
          ? HttpResponse.json({ message: 'down' }, { status: 503 })
          : HttpResponse.json({
              items: testPlants,
              page: 1,
              pageSize: 20,
              total: 3,
              totalPages: 1,
            }),
      ),
    );
    const { user } = renderApp('/plants');

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load plants.');
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Showing 1–3 of 3 plants')).toBeInTheDocument();
  });
});
