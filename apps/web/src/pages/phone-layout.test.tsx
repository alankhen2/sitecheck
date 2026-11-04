import { act, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { dataHandlers, testPlants } from '../test/data';
import { adminUser, authHandlers, inspectorUser } from '../test/fixtures';
import { currentUrl, renderApp } from '../test/render';
import { server } from '../test/server';
import { PHONE_WIDTH, setViewportWidth } from '../test/viewport';

function card(heading: string, name: string): HTMLElement {
  const item = within(screen.getByRole('list', { name }))
    .getAllByRole('listitem')
    .find((li) => within(li).queryByRole('heading', { name: heading }));
  if (!item) throw new Error(`No card for ${heading}`);
  return item;
}

beforeEach(() => {
  server.use(authHandlers.loggedInAs(adminUser), ...dataHandlers().handlers);
  setViewportWidth(PHONE_WIDTH);
});

describe('plants on a phone', () => {
  it('shows cards with every fact the table has, and no table', async () => {
    renderApp('/plants');
    await screen.findByText('Showing 1–3 of 3 plants');

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const loader = card('Komatsu WA480 Loader', 'Plants');
    expect(within(loader).getByText('Repair')).toBeInTheDocument();
    expect(within(loader).getByText('Overdue')).toBeInTheDocument();
    const stacker = card('Kalmar Reach Stacker', 'Plants');
    expect(within(stacker).getByText('PBT-RS-001')).toBeInTheDocument();
    expect(within(stacker).getByText('Port Botany Terminal 3')).toBeInTheDocument();
    expect(within(stacker).getByText('Not scheduled')).toBeInTheDocument();
  });

  it('opens the edit form from a card', async () => {
    const { user } = renderApp('/plants');
    await screen.findByText('Showing 1–3 of 3 plants');

    await user.click(
      within(card('Kalmar Reach Stacker', 'Plants')).getByRole('button', { name: /^Edit/ }),
    );

    expect(screen.getByRole('dialog', { name: 'Edit Kalmar Reach Stacker' })).toBeInTheDocument();
  });

  it('offers an inspector edit but not delete', async () => {
    server.use(authHandlers.loggedInAs(inspectorUser));
    renderApp('/plants');
    await screen.findByText('Showing 1–3 of 3 plants');

    const excavator = card('CAT 336 Excavator', 'Plants');
    expect(within(excavator).getByRole('button', { name: /^Edit/ })).toBeInTheDocument();
    expect(within(excavator).queryByRole('button', { name: /^Delete/ })).not.toBeInTheDocument();
  });

  it('follows the screen when it turns wide and back', async () => {
    renderApp('/plants');
    await screen.findByText('Showing 1–3 of 3 plants');

    act(() => {
      setViewportWidth(1024);
    });
    expect(screen.getByRole('table', { name: 'Plants' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Plants' })).not.toBeInTheDocument();

    act(() => {
      setViewportWidth(PHONE_WIDTH);
    });
    expect(screen.getByRole('list', { name: 'Plants' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('sites on a phone', () => {
  it('shows cards, with the plant count linking to the filtered plants page', async () => {
    const { router, user } = renderApp('/sites');
    await screen.findByRole('list', { name: 'Sites' });

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const siteId = testPlants[2]?.siteId ?? '';
    await user.click(screen.getByRole('link', { name: /at Port Botany Terminal 3$/ }));

    expect(currentUrl(router)).toBe(`/plants?siteId=${siteId}`);
  });

  it('opens the edit form from a card', async () => {
    const { user } = renderApp('/sites');
    await screen.findByRole('list', { name: 'Sites' });

    await user.click(
      within(card('Port Botany Terminal 3', 'Sites')).getByRole('button', { name: /^Edit/ }),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows an inspector the cards without any buttons', async () => {
    server.use(authHandlers.loggedInAs(inspectorUser));
    renderApp('/sites');

    const list = await screen.findByRole('list', { name: 'Sites' });
    expect(within(list).queryByRole('button')).not.toBeInTheDocument();
  });
});
