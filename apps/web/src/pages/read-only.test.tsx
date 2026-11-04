import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { dataHandlers, testPlants } from '../test/data';
import { authHandlers, viewerUser } from '../test/fixtures';
import { renderApp } from '../test/render';
import { server } from '../test/server';
import { PHONE_WIDTH, setViewportWidth } from '../test/viewport';

const plant = testPlants[0];
if (!plant) throw new Error('testPlants is empty');

beforeEach(() => {
  server.use(authHandlers.loggedInAs(viewerUser), ...dataHandlers().handlers);
});

describe('a viewer', () => {
  it('is told in the header that the account is read-only', async () => {
    renderApp('/plants');

    expect(await screen.findByText('Viewer (read-only)')).toBeInTheDocument();
  });

  it('sees the plants but nothing that changes them', async () => {
    renderApp('/plants');
    await screen.findByRole('link', { name: plant.name });

    expect(screen.queryByRole('button', { name: 'Add plant' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit / })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument();
  });

  it('sees the plant cards on a phone with nothing that changes them', async () => {
    setViewportWidth(PHONE_WIDTH);
    renderApp('/plants');
    await screen.findByRole('link', { name: plant.name });

    expect(screen.queryByRole('button', { name: /^Edit / })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add plant' })).not.toBeInTheDocument();
  });

  it('sees a plant and its history, but no way to inspect it', async () => {
    renderApp(`/plants/${plant.id}`);

    expect(await screen.findByRole('heading', { name: plant.name, level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Inspection history' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Inspect' })).not.toBeInTheDocument();
  });

  it('gets an explanation instead of the form when opening the inspection address', async () => {
    renderApp(`/plants/${plant.id}/inspect`);

    const message = await screen.findByRole('alert');
    expect(message).toHaveTextContent('This account can only view');
    expect(screen.queryByRole('button', { name: 'Save inspection' })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('main')).getByRole('link', { name: 'Back to plant' }),
    ).toBeVisible();
  });

  it('sees the sites but nothing that changes them', async () => {
    renderApp('/sites');
    await screen.findByRole('table', { name: 'Sites' });

    expect(screen.queryByRole('button', { name: 'Add site' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit / })).not.toBeInTheDocument();
  });
});
