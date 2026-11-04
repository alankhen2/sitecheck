import { expect, test } from '@playwright/test';
import { logIn, openPlant } from './flows';
import { admin } from './test-data';

test('logging in and adding a plant', async ({ page }) => {
  const plant = { name: 'Hitachi ZX350 Excavator', serialNumber: 'E2E-EX-001' };

  await logIn(page, admin.email);

  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Plants' })
    .click();
  await page.getByRole('button', { name: 'Add plant' }).click();

  const dialog = page.getByRole('dialog', { name: 'Add plant' });
  await dialog.getByLabel('Name').fill(plant.name);
  await dialog.getByLabel('Type').fill('Excavator');
  await dialog.getByLabel('Serial number').fill(plant.serialNumber);
  await dialog.getByLabel('Site').selectOption({ label: 'Westgate Quarry' });
  await dialog.getByRole('button', { name: 'Add plant' }).click();
  await expect(dialog).toBeHidden();

  // Found again by searching and opened from the server's data, not the form's.
  await openPlant(page, plant.name);
  await page.reload();
  await expect(page.getByRole('heading', { name: plant.name, level: 1 })).toBeVisible();

  await expect(page.getByText(plant.serialNumber)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Westgate Quarry' })).toBeVisible();

  const changes = page.getByRole('list', { name: 'Changes' });
  await expect(changes.getByText('Plant added')).toBeVisible();
  await expect(changes.getByText(admin.name)).toBeVisible();
});
