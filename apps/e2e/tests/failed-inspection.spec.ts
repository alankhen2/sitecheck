import { expect, test } from '@playwright/test';
import { CHECKLIST_ITEMS } from '@sitecheck/shared';
import { logIn, openPlant } from './flows';
import { inspector } from './test-data';

test('recording a failed inspection puts the plant in repair', async ({ page }) => {
  const plant = 'Komatsu WA480 Loader';
  const [failedItem, ...passedItems] = CHECKLIST_ITEMS;
  const comment = 'Hydraulic hose is leaking.';

  await logIn(page, inspector.email);
  await openPlant(page, plant);
  await expect(page.getByText('Active', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Inspect' }).click();
  await expect(page.getByRole('heading', { name: `Inspect ${plant}` })).toBeVisible();

  for (const item of passedItems) {
    await page.getByRole('radiogroup', { name: item }).getByLabel('Pass').check();
  }
  await page.getByRole('radiogroup', { name: failedItem }).getByLabel('Fail').check();

  // A fail needs a comment: without one, nothing is saved.
  await page.getByRole('button', { name: 'Save inspection' }).click();
  await expect(page.getByText('Say what is wrong.')).toBeVisible();
  await expect(page).toHaveURL(/\/inspect$/);

  await page.getByLabel(`Comment on ${failedItem}`).fill(comment);
  await page.getByRole('button', { name: 'Save inspection' }).click();

  await expect(page.getByText('Inspection failed. Its status is now Repair.')).toBeVisible();

  // After a reload everything below comes from the database.
  await page.reload();
  await expect(page.getByRole('heading', { name: plant, level: 1 })).toBeVisible();
  await expect(page.getByText('Repair', { exact: true })).toBeVisible();

  const latest = page.getByRole('list', { name: 'Inspections' }).getByRole('listitem').first();
  await expect(latest.getByText('Failed', { exact: true })).toBeVisible();
  await expect(latest.getByText(`by ${inspector.name}`)).toBeVisible();
  await expect(latest.getByText(comment).first()).toBeVisible();

  const changes = page.getByRole('list', { name: 'Changes' });
  await expect(changes.getByText('Inspection recorded: failed')).toBeVisible();
  await expect(changes.getByText('Status changed from Active to Repair')).toBeVisible();
});
