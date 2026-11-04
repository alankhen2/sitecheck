import { expect, test } from '@playwright/test';
import { logIn, openPlant } from './flows';
import { E2E_DEMO_PASSWORD, demo } from './test-data';

const main = { name: 'Main' };

test('the demo account can look at everything and change nothing', async ({ page }) => {
  const plant = 'CAT 336 Excavator';

  await logIn(page, demo.email, E2E_DEMO_PASSWORD);
  await expect(page.getByText('Viewer (read-only)')).toBeVisible();

  await page.getByRole('navigation', main).getByRole('link', { name: 'Plants' }).click();
  await expect(page.getByRole('heading', { name: 'Plants', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: plant })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add plant' })).toBeHidden();
  await expect(page.getByRole('button', { name: `Edit ${plant}` })).toBeHidden();

  await openPlant(page, plant);
  await expect(page.getByRole('heading', { name: 'Inspection history' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Inspect' })).toBeHidden();

  // The address of the form still works, but there is no form behind it.
  const plantPath = new URL(page.url()).pathname;
  await page.goto(`${plantPath}/inspect`);
  await expect(page.getByText('This account can only view plants')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save inspection' })).toBeHidden();

  // What hiding buttons cannot promise: the API itself refuses, with this session's cookie.
  const refused = await page.request.patch(`/api${plantPath}`, { data: { status: 'REPAIR' } });
  expect(refused.status()).toBe(403);

  await page.goto(plantPath);
  await expect(page.getByText('Active', { exact: true })).toBeVisible();
});

test('nobody can register on this server', async ({ request }) => {
  const res = await request.post('/api/auth/register', {
    data: { name: 'Visitor', email: 'visitor@example.com', password: 'a long enough password' },
  });

  expect(res.status()).toBe(403);
});
