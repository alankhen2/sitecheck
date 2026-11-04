import { CHECKLIST_ITEMS } from '@sitecheck/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { a11yProblems } from '../test/axe';
import { dataHandlers, testPlants } from '../test/data';
import { adminUser, authHandlers } from '../test/fixtures';
import { renderApp } from '../test/render';
import { server } from '../test/server';
import { PHONE_WIDTH, setViewportWidth } from '../test/viewport';

function loggedIn() {
  server.use(authHandlers.loggedInAs(adminUser), ...dataHandlers().handlers);
}

describe('automatic accessibility checks', () => {
  it('login page, also after a failed submit', async () => {
    server.use(authHandlers.loggedOut());
    const { user } = renderApp('/login');
    await screen.findByRole('heading', { name: 'Log in to SiteCheck' });
    expect(await a11yProblems()).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Log in' }));
    await screen.findByText('Enter a valid email address.');
    expect(await a11yProblems()).toEqual([]);
  });

  it('not-found page', async () => {
    renderApp('/no-such-page');
    await screen.findByRole('heading', { name: 'Page not found' });
    expect(await a11yProblems()).toEqual([]);
  });

  describe.each([
    ['wide screen', 1280],
    ['phone', PHONE_WIDTH],
  ])('on a %s', (_label, width) => {
    it('dashboard', async () => {
      setViewportWidth(width);
      loggedIn();
      renderApp('/dashboard');
      await screen.findByRole('list', { name: 'Plants by status' });
      expect(await a11yProblems()).toEqual([]);
    });

    it('plants page', async () => {
      setViewportWidth(width);
      loggedIn();
      renderApp('/plants');
      await screen.findByText('Showing 1–3 of 3 plants');
      expect(await a11yProblems()).toEqual([]);
    });

    it('plant page, with inspection history', async () => {
      setViewportWidth(width);
      const plantId = testPlants[0]?.id ?? '';
      server.use(
        authHandlers.loggedInAs(adminUser),
        ...dataHandlers(testPlants, undefined, [
          {
            id: '019a0000-0000-7000-8000-300000000001',
            plantId,
            inspectorName: 'Ivy Inspector',
            result: 'FAIL',
            notes: 'Tagged out',
            inspectedAt: '2026-11-01T00:00:00.000Z',
            items: CHECKLIST_ITEMS.map((label, index) => ({
              label,
              passed: index > 0,
              comment: index > 0 ? null : 'Cracked panel',
            })),
          },
        ]).handlers,
      );
      renderApp(`/plants/${plantId}`);
      await screen.findByRole('list', { name: 'Inspections' });
      expect(await a11yProblems()).toEqual([]);
    });

    it('inspection form, also showing its errors', async () => {
      setViewportWidth(width);
      loggedIn();
      const { user } = renderApp(`/plants/${testPlants[0]?.id ?? ''}/inspect`);
      const save = await screen.findByRole('button', { name: 'Save inspection' });
      expect(await a11yProblems()).toEqual([]);

      await user.click(save);
      await screen.findAllByText('Choose Pass or Fail.');
      expect(await a11yProblems()).toEqual([]);
    });

    it('sites page', async () => {
      setViewportWidth(width);
      loggedIn();
      renderApp('/sites');
      await screen.findByRole('button', { name: 'Edit Port Botany Terminal 3' });
      expect(await a11yProblems()).toEqual([]);
    });
  });

  it('plant form, also showing its errors', async () => {
    loggedIn();
    const { user } = renderApp('/plants');
    await screen.findByText('Showing 1–3 of 3 plants');

    await user.click(screen.getByRole('button', { name: 'Add plant' }));
    const dialog = await screen.findByRole('dialog');
    expect(await a11yProblems()).toEqual([]);

    await user.click(within(dialog).getByRole('button', { name: 'Add plant' }));
    await waitFor(() => {
      expect(within(dialog).getByLabelText(/Name/)).toBeInvalid();
    });
    expect(await a11yProblems()).toEqual([]);
  });

  it('site form and delete dialog', async () => {
    loggedIn();
    const { user } = renderApp('/sites');
    await screen.findByRole('button', { name: 'Edit Port Botany Terminal 3' });

    await user.click(screen.getByRole('button', { name: 'Edit Port Botany Terminal 3' }));
    await screen.findByRole('dialog');
    expect(await a11yProblems()).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await user.click(screen.getByRole('button', { name: 'Delete Port Botany Terminal 3' }));
    await screen.findByRole('dialog');
    expect(await a11yProblems()).toEqual([]);
  });
});
