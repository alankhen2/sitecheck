import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { dataHandlers } from '../test/data';
import { adminUser, authHandlers } from '../test/fixtures';
import { renderApp } from '../test/render';
import { server } from '../test/server';

describe('moving around the app', () => {
  beforeEach(() => {
    server.use(authHandlers.loggedInAs(adminUser), ...dataHandlers().handlers);
  });

  it('names the page in the browser tab', async () => {
    const { user } = renderApp('/plants');
    await screen.findByRole('heading', { name: 'Plants' });
    expect(document.title).toBe('Plants · SiteCheck');

    await user.click(screen.getByRole('link', { name: 'Sites' }));
    await screen.findByRole('heading', { name: 'Sites' });
    expect(document.title).toBe('Sites · SiteCheck');
  });

  it('moves focus to the new heading after following a link', async () => {
    const { user } = renderApp('/plants');
    await screen.findByRole('heading', { name: 'Plants' });

    await user.click(screen.getByRole('link', { name: 'Sites' }));

    expect(await screen.findByRole('heading', { name: 'Sites' })).toHaveFocus();
  });

  it('leaves focus alone on the first page, so the first Tab reaches the skip link', async () => {
    const { user } = renderApp('/plants');
    await screen.findByRole('heading', { name: 'Plants' });
    expect(document.body).toHaveFocus();

    await user.tab();

    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveFocus();
  });

  it('skips to the main content without changing the URL', async () => {
    const { router, user } = renderApp('/plants?q=cat');
    await screen.findByRole('heading', { name: 'Plants' });

    await user.tab();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('main')).toHaveFocus();
    expect(router.state.location.hash).toBe('');
    expect(router.state.location.search).toBe('?q=cat');
  });

  it('keeps focus on a filter when the filter changes the URL', async () => {
    const { router, user } = renderApp('/plants');
    await screen.findByText('Showing 1–3 of 3 plants');
    const repair = screen.getByRole('button', { name: 'Repair' });

    await user.click(repair);

    await waitFor(() => {
      expect(router.state.location.search).toContain('status=REPAIR');
    });
    expect(screen.getByRole('button', { name: 'Repair' })).toHaveFocus();
  });
});

describe('pages outside the app frame', () => {
  it('names the login page and focuses its heading after a redirect there', async () => {
    server.use(authHandlers.loggedOut());
    renderApp('/plants');

    expect(await screen.findByRole('heading', { name: 'Log in to SiteCheck' })).toHaveFocus();
    expect(document.title).toBe('Log in · SiteCheck');
  });

  it('names the not-found page', async () => {
    renderApp('/no-such-page');

    await screen.findByRole('heading', { name: 'Page not found' });
    expect(document.title).toBe('Page not found · SiteCheck');
  });
});
