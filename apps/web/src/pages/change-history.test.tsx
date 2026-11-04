import type { AuditEntry, Inspection } from '@sitecheck/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { dataHandlers, testPlants } from '../test/data';
import { adminUser, authHandlers } from '../test/fixtures';
import { currentUrl, renderApp } from '../test/render';
import { apiUrl, server } from '../test/server';

const plantId = testPlants[0]?.id ?? '';
const plantUrl = `/plants/${plantId}`;

let id = 0;
function entry(overrides: Partial<AuditEntry>): AuditEntry {
  id += 1;
  return {
    id: `019a0000-0000-7000-8000-5000000${String(id).padStart(5, '0')}`,
    entity: 'Plant',
    entityId: plantId,
    action: 'UPDATE',
    actorName: 'Ivy Inspector',
    changes: {},
    createdAt: '2026-11-04T01:30:00.000Z',
    ...overrides,
  };
}

const withAudit = (audit: AuditEntry[]) => dataHandlers(testPlants, undefined, [], audit).handlers;

beforeEach(() => {
  server.use(authHandlers.loggedInAs(adminUser));
});

async function changes() {
  return within(await screen.findByRole('list', { name: 'Changes' }));
}

describe('the change history of a plant', () => {
  it('says who did it and when, in local time', async () => {
    server.use(...withAudit([entry({ changes: { name: { from: 'Old name', to: 'New name' } } })]));
    renderApp(plantUrl);

    const list = await changes();

    expect(list.getByText('Name changed from Old name to New name')).toBeInTheDocument();
    // 01:30 UTC is 12:30 in Sydney in November (tests run in that time zone).
    const when = list.getByText(/4 Nov 2026/);
    expect(when).toHaveTextContent(/12:30/);
    expect(when.parentElement).toHaveTextContent('Ivy Inspector');
  });

  it('writes statuses and dates the way the rest of the app does', async () => {
    server.use(
      ...withAudit([
        entry({
          changes: {
            status: { from: 'ACTIVE', to: 'REPAIR' },
            nextInspectionAt: { from: null, to: '2026-12-04T01:30:00.000Z' },
          },
        }),
      ]),
    );
    renderApp(plantUrl);

    const list = await changes();

    expect(list.getByText('Status changed from Active to Repair')).toBeInTheDocument();
    expect(list.getByText('Next inspection changed from none to 4 Dec 2026')).toBeInTheDocument();
  });

  it('names added plants and recorded inspections in words', async () => {
    const inspection = (id: string, result: 'PASS' | 'FAIL'): Inspection => ({
      id,
      plantId,
      inspectorName: 'Ivy Inspector',
      result,
      notes: null,
      inspectedAt: '2026-11-04T01:30:00.000Z',
      items: [],
    });
    const failedId = '019a0000-0000-7000-8000-300000000001';
    const passedId = '019a0000-0000-7000-8000-300000000002';
    server.use(
      ...dataHandlers(
        testPlants,
        undefined,
        [inspection(failedId, 'FAIL'), inspection(passedId, 'PASS')],
        [
          entry({ action: 'CREATE', changes: { name: { from: null, to: 'Lift' } } }),
          entry({
            entity: 'Inspection',
            entityId: failedId,
            action: 'CREATE',
            changes: { result: { from: null, to: 'FAIL' } },
          }),
          entry({
            entity: 'Inspection',
            entityId: passedId,
            action: 'CREATE',
            changes: { result: { from: null, to: 'PASS' } },
          }),
        ],
      ).handlers,
    );
    renderApp(plantUrl);

    const list = await changes();

    expect(list.getByText('Plant added')).toBeInTheDocument();
    expect(list.getByText('Inspection recorded: failed')).toBeInTheDocument();
    expect(list.getByText('Inspection recorded: passed')).toBeInTheDocument();
  });

  it('says so when nothing has been recorded', async () => {
    server.use(...withAudit([]));
    renderApp(plantUrl);

    expect(await screen.findByText('No changes recorded yet.')).toBeInTheDocument();
  });

  it('shows old values as plain text, even when they look like HTML', async () => {
    const attack = '<img src=x onerror="window.hacked=1">';
    server.use(...withAudit([entry({ changes: { name: { from: attack, to: 'Lift' } } })]));
    renderApp(plantUrl);

    const list = await screen.findByRole('list', { name: 'Changes' });

    expect(list).toHaveTextContent(attack);
    expect(list.querySelector('img')).toBeNull();
  });

  it('pages on its own, without moving the inspection list', async () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      entry({ changes: { name: { from: `Name ${String(i)}`, to: `Name ${String(i + 1)}` } } }),
    );
    server.use(...withAudit(many));
    const { router, user } = renderApp(`${plantUrl}?page=3`);

    const pager = await screen.findByRole('navigation', { name: 'Change history pages' });
    await user.click(within(pager).getByRole('button', { name: /Next/ }));

    await waitFor(() => {
      expect(currentUrl(router)).toBe(`${plantUrl}?page=3&changesPage=2`);
    });
    const list = await changes();
    await waitFor(() => {
      expect(list.getAllByRole('listitem')).toHaveLength(2);
    });
  });

  it('offers a retry when the history cannot be loaded, and still shows the plant', async () => {
    server.use(...withAudit([]));
    server.use(
      http.get(apiUrl(`${plantUrl}/history`), () =>
        HttpResponse.json({ message: 'Internal Server Error' }, { status: 500 }),
      ),
    );
    renderApp(plantUrl);

    const alert = await screen.findByRole('alert', {}, { timeout: 5000 });

    expect(alert).toHaveTextContent('Could not load the changes.');
    expect(screen.getByRole('heading', { name: 'CAT 336 Excavator' })).toBeInTheDocument();
  });
});
