import { CHECKLIST_ITEMS } from '@sitecheck/shared';
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { dataHandlers, makePlant } from '../test/data';
import { inspectorUser, authHandlers } from '../test/fixtures';
import { currentUrl, renderApp } from '../test/render';
import { apiUrl, server } from '../test/server';

const DAY = 24 * 60 * 60 * 1000;
const inDays = (days: number) => new Date(Date.now() + days * DAY).toISOString();

const late = makePlant({ name: 'Late Loader', nextInspectionAt: inDays(-2) });
const soon = makePlant({ name: 'Soon Stacker', status: 'REPAIR', nextInspectionAt: inDays(2) });
const later = makePlant({ name: 'Later Lift', nextInspectionAt: inDays(30) });
const parked = makePlant({
  name: 'Parked Crane',
  status: 'INACTIVE',
  nextInspectionAt: inDays(-5),
});
const plants = [late, soon, later, parked];

beforeEach(() => {
  server.use(authHandlers.loggedInAs(inspectorUser));
});

const section = (name: RegExp) => within(screen.getByRole('region', { name }));

describe('the dashboard', () => {
  it('is the page at / and in the menu', async () => {
    server.use(...dataHandlers(plants).handlers);
    const { router } = renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(currentUrl(router)).toBe('/dashboard');
    expect(document.title).toBe('Dashboard · SiteCheck');
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
  });

  it('counts plants by status, each linking to the filtered list', async () => {
    server.use(...dataHandlers(plants).handlers);
    const { router, user } = renderApp('/dashboard');

    const counts = await screen.findByRole('list', { name: 'Plants by status' });
    expect(within(counts).getByRole('link', { name: '2 Active plants' })).toBeInTheDocument();
    expect(within(counts).getByRole('link', { name: '1 Inactive plants' })).toBeInTheDocument();

    await user.click(within(counts).getByRole('link', { name: '1 Repair plants' }));

    expect(currentUrl(router)).toBe('/plants?status=REPAIR');
    expect(await screen.findByRole('row', { name: /Soon Stacker/ })).toBeInTheDocument();
  });

  it('lists what is overdue and what is coming up, each in its place', async () => {
    server.use(...dataHandlers(plants).handlers);
    renderApp('/dashboard');
    await screen.findByRole('list', { name: 'Plants by status' });

    const overdue = section(/^Overdue/);
    expect(overdue.getByRole('link', { name: 'Late Loader' })).toBeInTheDocument();
    expect(overdue.getByText('Westgate Quarry')).toBeInTheDocument();
    expect(within(overdue.getByRole('listitem')).getByText('Overdue')).toBeInTheDocument();

    const dueSoon = section(/^Due in the next 7 days/);
    expect(dueSoon.getByRole('link', { name: 'Soon Stacker' })).toBeInTheDocument();
    expect(within(dueSoon.getByRole('listitem')).getByText('Due soon')).toBeInTheDocument();

    expect(screen.queryByRole('link', { name: 'Later Lift' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Parked Crane' })).not.toBeInTheDocument();
  });

  it('opens a plant from a list', async () => {
    server.use(...dataHandlers(plants).handlers);
    const { router, user } = renderApp('/dashboard');

    await user.click(await screen.findByRole('link', { name: 'Late Loader' }));

    expect(currentUrl(router)).toBe(`/plants/${late.id}`);
  });

  it('says so when nothing is due', async () => {
    server.use(...dataHandlers([later]).handlers);
    renderApp('/dashboard');

    expect(await screen.findByText('Nothing is overdue.')).toBeInTheDocument();
    expect(screen.getByText('Nothing is due in the next 7 days.')).toBeInTheDocument();
  });

  it('says when a list is cut short, and links to all of them', async () => {
    server.use(...dataHandlers(plants).handlers);
    server.use(
      http.get(apiUrl('/dashboard'), () =>
        HttpResponse.json({
          counts: { ACTIVE: 14, REPAIR: 0, INACTIVE: 0 },
          overdue: { items: [late], total: 14 },
          dueSoon: { items: [], total: 0 },
        }),
      ),
    );
    renderApp('/dashboard');

    expect(await screen.findByText(/The 1 most urgent of 14/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See all by date' })).toHaveAttribute(
      'href',
      '/plants?sort=nextInspectionAt',
    );
  });

  it('offers a retry when it cannot load', async () => {
    server.use(...dataHandlers(plants).handlers);
    server.use(
      http.get(apiUrl('/dashboard'), () =>
        HttpResponse.json({ message: 'Internal Server Error' }, { status: 500 }),
      ),
    );
    renderApp('/dashboard');

    const alert = await screen.findByRole('alert', {}, { timeout: 5000 });
    expect(alert).toHaveTextContent('Could not load the dashboard.');
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('is up to date after an inspection', async () => {
    server.use(...dataHandlers(plants).handlers);
    const { user } = renderApp('/dashboard');

    await user.click(await screen.findByRole('link', { name: 'Late Loader' }));
    await user.click(await screen.findByRole('link', { name: 'Inspect' }));
    await screen.findByRole('button', { name: 'Save inspection' });
    for (const label of CHECKLIST_ITEMS) {
      await user.click(
        within(screen.getByRole('radiogroup', { name: label })).getByRole('radio', {
          name: 'Pass',
        }),
      );
    }
    await user.click(screen.getByRole('button', { name: 'Save inspection' }));
    await screen.findByText(/Inspection passed/);
    await user.click(screen.getByRole('link', { name: 'Dashboard' }));

    expect(await screen.findByText('Nothing is overdue.')).toBeInTheDocument();
  });
});
