import type { Site } from '@sitecheck/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { dataHandlers, makePlant, testPlants, testSites } from '../test/data';
import { adminUser, authHandlers, inspectorUser } from '../test/fixtures';
import { renderApp } from '../test/render';
import { apiUrl, server } from '../test/server';

// Inspectors may add and edit plants, so most tests use one.
beforeEach(() => {
  server.use(authHandlers.loggedInAs(inspectorUser));
});

const [port, quarry] = testSites as [Site, Site];
const closedYard: Site = {
  id: '019a0000-0000-7000-8000-000000000009',
  name: 'Closed Yard',
  address: '9 Old Rd, Newcastle NSW 2300',
  isActive: false,
  plantCount: 0,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

/** Picks a datetime in the input, like a browser does once a full value is chosen. */
function setDateTime(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

async function openAddForm() {
  const app = renderApp('/plants');
  await screen.findByText('Showing 1–3 of 3 plants');
  await app.user.click(screen.getByRole('button', { name: 'Add plant' }));
  return { ...app, dialog: screen.getByRole('dialog', { name: 'Add plant' }) };
}

describe('adding a plant', () => {
  it('lets an inspector add a plant, sending the schedule as an exact moment', async () => {
    const data = dataHandlers();
    server.use(...data.handlers);
    const { user, dialog } = await openAddForm();

    const form = within(dialog);
    expect(form.getByLabelText('Name')).toHaveFocus();
    await user.type(form.getByLabelText('Name'), 'Hitachi ZX210');
    await user.type(form.getByLabelText('Type'), 'Excavator');
    await user.type(form.getByLabelText('Serial number'), ' WGQ-EX-003 ');
    await user.selectOptions(form.getByLabelText('Site'), 'Westgate Quarry');
    await user.selectOptions(form.getByLabelText('Status'), 'Repair');
    setDateTime(form.getByLabelText('Next inspection'), '2026-11-05T09:30');
    await user.click(form.getByRole('button', { name: 'Add plant' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(await screen.findByText('Showing 1–4 of 4 plants')).toBeInTheDocument();
    expect(data.writes).toEqual([
      {
        method: 'POST',
        path: '/plants',
        body: {
          siteId: quarry.id,
          name: 'Hitachi ZX210',
          type: 'Excavator',
          serialNumber: 'WGQ-EX-003',
          status: 'REPAIR',
          // 9:30 in Sydney (the test time zone, UTC+11 in November).
          nextInspectionAt: '2026-11-04T22:30:00.000Z',
        },
      },
    ]);
  });

  it('sends null for an empty schedule', async () => {
    const data = dataHandlers();
    server.use(...data.handlers);
    const { user, dialog } = await openAddForm();

    const form = within(dialog);
    await user.type(form.getByLabelText('Name'), 'Lift');
    await user.type(form.getByLabelText('Type'), 'Forklift');
    await user.type(form.getByLabelText('Serial number'), 'PBT-FL-009');
    await user.selectOptions(form.getByLabelText('Site'), 'Port Botany Terminal 3');
    await user.click(form.getByRole('button', { name: 'Add plant' }));

    await waitFor(() => {
      expect(data.writes).toHaveLength(1);
    });
    expect(data.writes[0]?.body).toMatchObject({ status: 'ACTIVE', nextInspectionAt: null });
  });

  it('refreshes the site plant counts afterwards', async () => {
    server.use(...dataHandlers().handlers);
    const { router, user, dialog } = await openAddForm();
    const form = within(dialog);
    await user.type(form.getByLabelText('Name'), 'Lift');
    await user.type(form.getByLabelText('Type'), 'Forklift');
    await user.type(form.getByLabelText('Serial number'), 'PBT-FL-009');
    await user.selectOptions(form.getByLabelText('Site'), 'Port Botany Terminal 3');
    await user.click(form.getByRole('button', { name: 'Add plant' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    await router.navigate('/sites');
    const row = await screen.findByRole('row', { name: /Port Botany Terminal 3/ });
    expect(within(row).getByText('2 plants')).toBeInTheDocument();
  });

  it('shows what is missing and sends nothing', async () => {
    const data = dataHandlers();
    server.use(...data.handlers);
    const { user, dialog } = await openAddForm();

    const form = within(dialog);
    await user.click(form.getByRole('button', { name: 'Add plant' }));

    expect(await form.findByText('Enter a name of up to 120 characters.')).toBeVisible();
    expect(form.getByText('Enter a type of up to 60 characters.')).toBeVisible();
    expect(form.getByText('Enter a serial number of up to 60 characters.')).toBeVisible();
    expect(form.getByText('Choose a site.')).toBeVisible();
    expect(form.getByLabelText('Site')).toHaveAttribute('aria-invalid', 'true');
    expect(data.writes).toEqual([]);
  });

  it('puts a taken serial number on its own field, then saves once it is changed', async () => {
    const data = dataHandlers();
    server.use(...data.handlers);
    const { user, dialog } = await openAddForm();

    const form = within(dialog);
    await user.type(form.getByLabelText('Name'), 'Second loader');
    await user.type(form.getByLabelText('Type'), 'Wheel loader');
    await user.type(form.getByLabelText('Serial number'), 'WGQ-WL-002');
    await user.selectOptions(form.getByLabelText('Site'), 'Westgate Quarry');
    await user.click(form.getByRole('button', { name: 'Add plant' }));

    const serial = form.getByLabelText('Serial number');
    expect(await form.findByText('Another plant already has this serial number.')).toBeVisible();
    expect(serial).toHaveAttribute('aria-invalid', 'true');
    expect(serial).toHaveFocus();
    // On the field, not repeated in a banner.
    expect(form.queryByRole('alert')).not.toBeInTheDocument();

    await user.clear(serial);
    await user.type(serial, 'WGQ-WL-003');
    await user.click(form.getByRole('button', { name: 'Add plant' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(data.writes.map((w) => (w.body as { serialNumber: string }).serialNumber)).toEqual([
      'WGQ-WL-002',
      'WGQ-WL-003',
    ]);
  });

  it('offers only active sites', async () => {
    server.use(...dataHandlers(testPlants, [...testSites, closedYard]).handlers);
    const { dialog } = await openAddForm();

    const options = within(within(dialog).getByLabelText('Site')).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      'Choose a site',
      'Port Botany Terminal 3',
      'Westgate Quarry',
    ]);
  });

  it('starts on the site the list is filtered to, if it is active', async () => {
    server.use(...dataHandlers().handlers);
    const { user } = renderApp(`/plants?siteId=${port.id}`);
    await screen.findByText('Showing 1–1 of 1 plants');

    await user.click(screen.getByRole('button', { name: 'Add plant' }));

    const dialog = screen.getByRole('dialog', { name: 'Add plant' });
    expect(within(dialog).getByLabelText('Site')).toHaveValue(port.id);
  });

  it('shows other refusals at the top of the form', async () => {
    // The site was closed after the form loaded its list of sites.
    const data = dataHandlers();
    server.use(...data.handlers);
    const { user, dialog } = await openAddForm();
    const form = within(dialog);
    await user.type(form.getByLabelText('Name'), 'Lift');
    await user.type(form.getByLabelText('Type'), 'Forklift');
    await user.type(form.getByLabelText('Serial number'), 'X-1');
    await user.selectOptions(form.getByLabelText('Site'), 'Westgate Quarry');
    // Close the site behind the form's back.
    await fetch(new URL(`/api/sites/${quarry.id}`, window.location.origin), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ isActive: false }),
    });
    await user.click(form.getByRole('button', { name: 'Add plant' }));

    expect(await form.findByRole('alert')).toHaveTextContent(
      'Cannot place a plant at an inactive site',
    );
  });
});

describe('editing a plant', () => {
  async function openEditForm(name: string) {
    const app = renderApp('/plants');
    await screen.findByText(/Showing 1–/);
    await app.user.click(screen.getByRole('button', { name: `Edit ${name}` }));
    return { ...app, dialog: screen.getByRole('dialog', { name: `Edit ${name}` }) };
  }

  it('fills in the current values, the schedule in local time', async () => {
    server.use(...dataHandlers().handlers);
    const { dialog } = await openEditForm('CAT 336 Excavator');

    const form = within(dialog);
    expect(form.getByLabelText('Name')).toHaveValue('CAT 336 Excavator');
    expect(form.getByLabelText('Serial number')).toHaveValue('WGQ-EX-001');
    expect(form.getByLabelText('Site')).toHaveValue(quarry.id);
    expect(form.getByLabelText('Status')).toHaveValue('ACTIVE');
    // Stored as 2099-01-10T00:00Z; Sydney is UTC+11 in January.
    expect(form.getByLabelText('Next inspection')).toHaveValue('2099-01-10T11:00');
  });

  it('sends only what changed', async () => {
    const data = dataHandlers();
    server.use(...data.handlers);
    const { user, dialog } = await openEditForm('CAT 336 Excavator');

    const form = within(dialog);
    await user.selectOptions(form.getByLabelText('Status'), 'Repair');
    await user.click(form.getByRole('button', { name: 'Save changes' }));

    const row = await screen.findByRole('row', { name: /CAT 336 Excavator.*Repair/ });
    expect(row).toBeInTheDocument();
    expect(data.writes).toEqual([
      { method: 'PATCH', path: `/plants/${testPlants[0]?.id ?? ''}`, body: { status: 'REPAIR' } },
    ]);
  });

  it('clears a schedule by sending null', async () => {
    const data = dataHandlers();
    server.use(...data.handlers);
    const { user, dialog } = await openEditForm('CAT 336 Excavator');

    setDateTime(within(dialog).getByLabelText('Next inspection'), '');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(data.writes).toHaveLength(1);
    });
    expect(data.writes[0]?.body).toEqual({ nextInspectionAt: null });
  });

  it('closes without a request when nothing changed', async () => {
    const data = dataHandlers();
    server.use(...data.handlers);
    const { user, dialog } = await openEditForm('CAT 336 Excavator');

    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(data.writes).toEqual([]);
  });

  it('keeps a plant at an inactive site there when other fields change', async () => {
    const parked = makePlant({
      name: 'Parked crane',
      siteId: closedYard.id,
      siteName: closedYard.name,
    });
    const data = dataHandlers([parked], [...testSites, closedYard]);
    server.use(...data.handlers);
    const { user, dialog } = await openEditForm('Parked crane');

    const site = within(dialog).getByLabelText('Site');
    expect(site).toHaveValue(closedYard.id);
    expect(
      within(site).getByRole('option', { name: 'Closed Yard (inactive)' }),
    ).toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText('Status'), 'Inactive');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(data.writes).toHaveLength(1);
    });
    // No siteId: the plant is not moved, so the API allows it.
    expect(data.writes[0]?.body).toEqual({ status: 'INACTIVE' });
  });
});

describe('deleting a plant', () => {
  beforeEach(() => {
    server.use(authHandlers.loggedInAs(adminUser));
  });

  it('lets an admin delete a plant after confirming', async () => {
    const data = dataHandlers();
    server.use(...data.handlers);
    const { user } = renderApp('/plants');
    await screen.findByText('Showing 1–3 of 3 plants');

    await user.click(screen.getByRole('button', { name: 'Delete Kalmar Reach Stacker' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete Kalmar Reach Stacker?' });
    expect(dialog).toHaveTextContent('Serial number PBT-RS-001 at Port Botany Terminal 3.');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Delete plant' }));

    expect(await screen.findByText('Showing 1–2 of 2 plants')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(data.writes).toEqual([
      { method: 'DELETE', path: `/plants/${testPlants[2]?.id ?? ''}`, body: null },
    ]);
  });

  it('explains what to do instead for a plant with inspection history', async () => {
    server.use(...dataHandlers().handlers);
    server.use(
      http.delete(apiUrl('/plants/:id'), () =>
        HttpResponse.json(
          {
            message:
              'Plant has inspection history; set its status to INACTIVE instead of deleting it',
            code: 'PLANT_HAS_INSPECTIONS',
          },
          { status: 409 },
        ),
      ),
    );
    const { user } = renderApp('/plants');
    await screen.findByText('Showing 1–3 of 3 plants');

    await user.click(screen.getByRole('button', { name: 'Delete CAT 336 Excavator' }));
    await user.click(screen.getByRole('button', { name: 'Delete plant' }));

    const dialog = await screen.findByRole('dialog', { name: 'Cannot delete CAT 336 Excavator' });
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Set its status to Inactive');
    // The Delete button that had focus is gone; focus moves to Close, not to nowhere.
    expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus();
    expect(within(dialog).queryByRole('button', { name: 'Delete plant' })).not.toBeInTheDocument();
  });

  it('does not offer delete to an inspector, who can still edit', async () => {
    server.use(authHandlers.loggedInAs(inspectorUser), ...dataHandlers().handlers);
    renderApp('/plants');
    await screen.findByText('Showing 1–3 of 3 plants');

    expect(screen.getByRole('button', { name: 'Edit CAT 336 Excavator' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
  });
});
