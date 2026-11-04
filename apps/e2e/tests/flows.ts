import { expect, type Page } from '@playwright/test';
import { E2E_PASSWORD } from './test-data';

/** Logs in through the real form, starting from the home page like a user would. */
export async function logIn(page: Page, email: string, password = E2E_PASSWORD): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Log in to SiteCheck' })).toBeVisible();

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();

  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
}

/** Goes to the plants list and narrows it to one plant, past any pagination. */
export async function openPlant(page: Page, name: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Plants' })
    .click();
  await page.getByRole('searchbox').fill(name);
  await page.getByRole('link', { name, exact: true }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
}
