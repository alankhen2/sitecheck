import { CHECKLIST_ITEMS, type Inspection } from '@sitecheck/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { dataHandlers, makePlant, testPlants } from '../test/data';
import { adminUser, authHandlers, inspectorUser } from '../test/fixtures';
import { currentUrl, renderApp } from '../test/render';
import { apiUrl, server } from '../test/server';

const [excavator, loader, stacker] = testPlants as [
  (typeof testPlants)[number],
  (typeof testPlants)[number],
  (typeof testPlants)[number],
];

beforeEach(() => {
  server.use(authHandlers.loggedInAs(inspectorUser));
});

function pastInspection(overrides: Partial<Inspection> = {}): Inspection {
  return {
    id: '019a0000-0000-7000-8000-300000000001',
    plantId: excavator.id,
    inspectorName: 'Ivy Inspector',
    result: 'PASS',
    notes: null,
    inspectedAt: '2026-10-07T00:00:00.000Z',
    items: CHECKLIST_ITEMS.map((label) => ({ label, passed: true, comment: null })),
    ...overrides,
  };
}

const failedInspection = pastInspection({
  id: '019a0000-0000-7000-8000-300000000002',
  result: 'FAIL',
  inspectedAt: '2026-11-01T00:00:00.000Z',
  items: CHECKLIST_ITEMS.map((label) =>
    label === 'Brakes and controls'
      ? { label, passed: false, comment: 'Parking brake does not hold' }
      : { label, passed: true, comment: null },
  ),
});

describe('the plant page', () => {
  it('is reached from the name in the plant list', async () => {
    server.use(...dataHandlers().handlers);
    const { router, user } = renderApp('/plants');

    await user.click(await screen.findByRole('link', { name: 'CAT 336 Excavator' }));

    expect(await screen.findByRole('heading', { name: 'CAT 336 Excavator' })).toHaveFocus();
    expect(currentUrl(router)).toBe(`/plants/${excavator.id}`);
    expect(document.title).toBe('CAT 336 Excavator · SiteCheck');
  });

  it('shows the facts of the plant', async () => {
    server.use(...dataHandlers().handlers);
    renderApp(`/plants/${excavator.id}`);

    expect(await screen.findByText('WGQ-EX-001')).toBeInTheDocument();
    expect(screen.getByText('Excavator')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Westgate Quarry' })).toHaveAttribute(
      'href',
      `/plants?siteId=${excavator.siteId}`,
    );
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('says so when there are no inspections yet', async () => {
    server.use(...dataHandlers().handlers);
    renderApp(`/plants/${excavator.id}`);

    expect(await screen.findByText('No inspections yet.')).toBeInTheDocument();
  });

  it('shows what failed without opening anything, and all items on request', async () => {
    server.use(...dataHandlers(testPlants, undefined, [failedInspection]).handlers);
    renderApp(`/plants/${excavator.id}`);

    const list = await screen.findByRole('list', { name: 'Inspections' });
    expect(within(list).getByText('Failed')).toBeInTheDocument();
    expect(within(list).getByText('by Ivy Inspector')).toBeInTheDocument();
    // Once in the summary, once among all the items.
    expect(within(list).getAllByText(/Parking brake does not hold/)[0]).toBeVisible();
    expect(within(list).getByText(/All 6 items/)).toBeInTheDocument();
  });

  it('pages through the history with the page in the URL', async () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      pastInspection({
        id: `019a0000-0000-7000-8000-4000000000${String(i).padStart(2, '0')}`,
        inspectedAt: `2026-10-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
      }),
    );
    server.use(...dataHandlers(testPlants, undefined, many).handlers);
    const { router, user } = renderApp(`/plants/${excavator.id}`);

    const list = await screen.findByRole('list', { name: 'Inspections' });
    expect(within(list).getAllByRole('heading')).toHaveLength(10);

    await user.click(screen.getByRole('button', { name: /Next/ }));

    await waitFor(() => {
      expect(
        within(screen.getByRole('list', { name: 'Inspections' })).getAllByRole('heading'),
      ).toHaveLength(2);
    });
    expect(currentUrl(router)).toBe(`/plants/${excavator.id}?page=2`);
  });

  it('does not offer an inspection for an inactive plant, and says why', async () => {
    server.use(...dataHandlers().handlers);
    renderApp(`/plants/${stacker.id}`);

    expect(await screen.findByText(/This plant is inactive/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Inspect' })).not.toBeInTheDocument();
  });

  it('says a plant does not exist for an unknown id', async () => {
    server.use(...dataHandlers().handlers);
    renderApp('/plants/019a0000-0000-7000-8000-00000000ffff');

    expect(await screen.findByRole('heading', { name: 'Plant not found' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says the same for an address whose id is malformed, which the API answers with 400', async () => {
    server.use(...dataHandlers().handlers);
    server.use(
      http.get(apiUrl('/plants/not-an-id'), () =>
        HttpResponse.json({ message: 'params/id Invalid UUID' }, { status: 400 }),
      ),
    );
    renderApp('/plants/not-an-id');

    expect(await screen.findByRole('heading', { name: 'Plant not found' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offers a retry when the plant cannot be loaded', async () => {
    server.use(...dataHandlers().handlers);
    server.use(
      http.get(apiUrl(`/plants/${excavator.id}`), () =>
        HttpResponse.json({ message: 'Internal Server Error' }, { status: 500 }),
      ),
    );
    renderApp(`/plants/${excavator.id}`);

    const alert = await screen.findByRole('alert', {}, { timeout: 5000 });
    expect(alert).toHaveTextContent('Could not load this plant.');
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('shows notes as plain text, even when they look like HTML', async () => {
    const attack = '<img src=x onerror="window.hacked=1"><b>bold</b>';
    server.use(
      ...dataHandlers(testPlants, undefined, [pastInspection({ notes: attack })]).handlers,
    );
    renderApp(`/plants/${excavator.id}`);

    expect(await screen.findByText(attack)).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Inspections' });
    expect(list.querySelector('img')).toBeNull();
    expect(list.querySelector('b')).toBeNull();
  });
});

/** Answers every item on the form: pass, except the labels given as failed. */
async function answerAll(user: ReturnType<typeof renderApp>['user'], ...failed: string[]) {
  for (const label of CHECKLIST_ITEMS) {
    const group = screen.getByRole('radiogroup', { name: label });
    await user.click(
      within(group).getByRole('radio', { name: failed.includes(label) ? 'Fail' : 'Pass' }),
    );
  }
}

async function openForm(plantId: string = excavator.id) {
  const app = renderApp(`/plants/${plantId}/inspect`);
  await screen.findByRole('button', { name: 'Save inspection' });
  return app;
}

describe('the inspection form', () => {
  it('is reached from the plant page', async () => {
    server.use(...dataHandlers().handlers);
    const { router, user } = renderApp(`/plants/${excavator.id}`);

    await user.click(await screen.findByRole('link', { name: 'Inspect' }));

    expect(await screen.findByRole('heading', { name: 'Inspect CAT 336 Excavator' })).toHaveFocus();
    expect(currentUrl(router)).toBe(`/plants/${excavator.id}/inspect`);
  });

  it('starts with nothing answered, so no item passes by being skipped', async () => {
    server.use(...dataHandlers().handlers);
    await openForm();

    for (const radio of screen.getAllByRole('radio')) expect(radio).not.toBeChecked();
    expect(screen.getAllByRole('radiogroup')).toHaveLength(CHECKLIST_ITEMS.length);
  });

  it('refuses to save until every item is answered, and sends nothing', async () => {
    const data = dataHandlers();
    server.use(...data.handlers);
    const { user } = await openForm();

    await user.click(
      within(screen.getByRole('radiogroup', { name: 'Lights and alarms' })).getByRole('radio', {
        name: 'Pass',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Save inspection' }));

    expect(await screen.findAllByText('Choose Pass or Fail.')).toHaveLength(
      CHECKLIST_ITEMS.length - 1,
    );
    expect(data.writes).toEqual([]);
  });

  it('asks for a comment on a failed item, also when others are unanswered', async () => {
    const data = dataHandlers();
    server.use(...data.handlers);
    const { user } = await openForm();
    const group = screen.getByRole('radiogroup', { name: 'Lights and alarms' });

    await user.click(within(group).getByRole('radio', { name: 'Fail' }));
    const comment = screen.getByLabelText(/Comment on Lights and alarms/);
    expect(comment).toHaveAccessibleName(expect.stringContaining('required'));

    await user.click(screen.getByRole('button', { name: 'Save inspection' }));

    expect(await screen.findByText('Say what is wrong.')).toBeInTheDocument();
    expect(comment).toBeInvalid();
    expect(comment).toHaveAccessibleDescription('Say what is wrong.');
    expect(data.writes).toEqual([]);
  });

  it('does not accept only spaces as the comment on a failed item', async () => {
    const data = dataHandlers();
    server.use(...data.handlers);
    const { user } = await openForm();

    await answerAll(user, 'Tyres or tracks');
    await user.type(screen.getByLabelText(/Comment on Tyres or tracks/), '   ');
    await user.click(screen.getByRole('button', { name: 'Save inspection' }));

    expect(await screen.findByText('Say what is wrong.')).toBeInTheDocument();
    expect(data.writes).toEqual([]);
  });

  it('saves a pass, returns to the plant and shows the new schedule', async () => {
    const data = dataHandlers();
    server.use(...data.handlers);
    const { router, user } = await openForm(loader.id);

    await answerAll(user);
    await user.click(screen.getByRole('button', { name: 'Save inspection' }));

    const outcome = await screen.findByRole('status');
    expect(outcome).toHaveTextContent(
      /Inspection passed\. Its status is now Active, and its next inspection is on/,
    );
    expect(currentUrl(router)).toBe(`/plants/${loader.id}`);
    expect(screen.getByRole('heading', { name: 'Komatsu WA480 Loader' })).toHaveFocus();
    expect(await screen.findByText('Passed')).toBeInTheDocument();
    expect(data.writes).toHaveLength(1);
    expect(data.writes[0]?.path).toBe(`/plants/${loader.id}/inspections`);
  });

  it('saves a fail with its comment and notes, and shows the plant in Repair', async () => {
    const data = dataHandlers();
    server.use(...data.handlers);
    const { user } = await openForm();

    await answerAll(user, 'Brakes and controls');
    await user.type(
      screen.getByLabelText(/Comment on Brakes and controls/),
      'Parking brake does not hold',
    );
    await user.type(screen.getByLabelText(/Notes/), 'Tagged out');
    await user.click(screen.getByRole('button', { name: 'Save inspection' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Inspection failed. Its status is now Repair.',
    );
    expect(screen.getByText('Repair')).toBeInTheDocument();
    expect((await screen.findAllByText(/Parking brake does not hold/)).length).toBeGreaterThan(0);
    expect(screen.getByText('Tagged out')).toBeInTheDocument();
    expect(data.writes[0]?.body).toMatchObject({
      notes: 'Tagged out',
      items: expect.arrayContaining([
        { label: 'Brakes and controls', passed: false, comment: 'Parking brake does not hold' },
        { label: 'Tyres or tracks', passed: true, comment: null },
      ]) as unknown,
    });
  });

  it('refreshes the plant list after saving', async () => {
    server.use(...dataHandlers().handlers);
    const { router, user } = renderApp('/plants');
    await screen.findByText('Showing 1–3 of 3 plants');
    expect(
      within(screen.getByRole('row', { name: /CAT 336/ })).getByText('Active'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'CAT 336 Excavator' }));
    await user.click(await screen.findByRole('link', { name: 'Inspect' }));
    await screen.findByRole('button', { name: 'Save inspection' });
    await answerAll(user, 'Lights and alarms');
    await user.type(screen.getByLabelText(/Comment on Lights and alarms/), 'Alarm silent');
    await user.click(screen.getByRole('button', { name: 'Save inspection' }));
    await screen.findByRole('status');
    await router.navigate('/plants');

    await waitFor(() => {
      const row = screen.getByRole('row', { name: /CAT 336/ });
      expect(within(row).getByText('Repair')).toBeInTheDocument();
    });
  });

  it('after saving, Back does not reopen the form', async () => {
    server.use(...dataHandlers().handlers);
    const { router, user } = renderApp(`/plants/${excavator.id}`);

    await user.click(await screen.findByRole('link', { name: 'Inspect' }));
    await screen.findByRole('button', { name: 'Save inspection' });
    await answerAll(user);
    await user.click(screen.getByRole('button', { name: 'Save inspection' }));
    await screen.findByRole('status');
    await router.navigate(-1);

    await screen.findByRole('heading', { name: 'CAT 336 Excavator' });
    expect(screen.queryByRole('button', { name: 'Save inspection' })).not.toBeInTheDocument();
  });

  it('keeps what was entered and shows the reason when the API refuses', async () => {
    server.use(...dataHandlers().handlers);
    server.use(
      http.post(apiUrl(`/plants/${excavator.id}/inspections`), () =>
        HttpResponse.json(
          { message: 'This plant is inactive, so it cannot be inspected', code: 'PLANT_INACTIVE' },
          { status: 409 },
        ),
      ),
    );
    const { router, user } = await openForm();

    await answerAll(user);
    await user.type(screen.getByLabelText(/Notes/), 'Keep this');
    await user.click(screen.getByRole('button', { name: 'Save inspection' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This plant is inactive');
    expect(screen.getByLabelText(/Notes/)).toHaveValue('Keep this');
    expect(currentUrl(router)).toBe(`/plants/${excavator.id}/inspect`);
  });

  it('shows no form for an inactive plant opened by its address', async () => {
    server.use(...dataHandlers().handlers);
    renderApp(`/plants/${stacker.id}/inspect`);

    expect(await screen.findByRole('alert')).toHaveTextContent('This plant is inactive');
    expect(screen.queryByRole('button', { name: 'Save inspection' })).not.toBeInTheDocument();
  });

  it('is open to an admin too', async () => {
    server.use(
      authHandlers.loggedInAs(adminUser),
      ...dataHandlers([makePlant({ id: excavator.id })]).handlers,
    );
    await openForm();

    expect(screen.getAllByRole('radiogroup')).toHaveLength(CHECKLIST_ITEMS.length);
  });
});
