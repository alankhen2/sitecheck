import { expect, test, type Locator, type Page } from '@playwright/test';
import { CHECKLIST_ITEMS } from '@sitecheck/shared';
import path from 'node:path';
import { E2E_PASSWORD, inspector } from '../tests/test-data';

// The demo video: one slow walk through the app, with captions instead of a voice.
// It still asserts each step, so a broken flow fails instead of being filmed.

const size = { width: 1280, height: 720 };
const output = 'demo-output/sitecheck-demo.webm';
const CAPTION_ID = 'demo-caption';
const CURSOR_ID = 'demo-cursor';
// The README's screenshots, committed, so a new recording shows up in the diff.
const images = path.resolve(import.meta.dirname, '../../../docs/images');

/**
 * Runs in every page before the app: a caption bar and a visible cursor, because
 * recorded video shows neither. Both ignore the mouse and are hidden from screen readers.
 */
function addOverlay(ids: { caption: string; cursor: string }): void {
  const add = (): void => {
    const caption = document.createElement('div');
    caption.id = ids.caption;
    caption.setAttribute('aria-hidden', 'true');
    Object.assign(caption.style, {
      position: 'fixed',
      left: '50%',
      bottom: '24px',
      transform: 'translateX(-50%)',
      maxWidth: '80%',
      padding: '10px 18px',
      borderRadius: '8px',
      background: 'rgba(15, 23, 42, 0.88)',
      color: 'white',
      font: '500 20px/1.4 system-ui, sans-serif',
      textAlign: 'center',
      pointerEvents: 'none',
      zIndex: '2147483647',
    });
    caption.hidden = true;

    const cursor = document.createElement('div');
    cursor.id = ids.cursor;
    cursor.setAttribute('aria-hidden', 'true');
    Object.assign(cursor.style, {
      position: 'fixed',
      left: '-40px',
      top: '-40px',
      width: '22px',
      height: '22px',
      margin: '-11px 0 0 -11px',
      borderRadius: '50%',
      background: 'rgba(245, 158, 11, 0.55)',
      border: '2px solid rgb(180, 83, 9)',
      pointerEvents: 'none',
      zIndex: '2147483647',
    });
    document.addEventListener('mousemove', (event) => {
      cursor.style.left = `${String(event.clientX)}px`;
      cursor.style.top = `${String(event.clientY)}px`;
    });

    document.body.append(caption, cursor);
  };
  // Init scripts run before the page has a body.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add);
  else add();
}

/** Shows a caption and leaves time to read it. */
async function say(page: Page, text: string, readMs = 2800): Promise<void> {
  await page.evaluate(
    ({ id, text }) => {
      const caption = document.getElementById(id);
      if (!caption) return;
      caption.textContent = text;
      caption.hidden = false;
    },
    { id: CAPTION_ID, text },
  );
  await page.waitForTimeout(readMs);
}

/** A screenshot for the README, without the caption and cursor drawn for the video. */
async function snap(page: Page, name: string, fullPage = false): Promise<void> {
  const overlay = [CAPTION_ID, CURSOR_ID];
  await page.evaluate((ids) => {
    for (const id of ids) document.getElementById(id)?.style.setProperty('visibility', 'hidden');
  }, overlay);
  await page.screenshot({ path: path.join(images, `${name}.png`), fullPage });
  await page.evaluate((ids) => {
    for (const id of ids) document.getElementById(id)?.style.removeProperty('visibility');
  }, overlay);
}

/** Glides the mouse to the element so the viewer can follow, then acts on it. */
async function reach(page: Page, target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error('The element to reach has no box on screen.');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 20 });
  await page.waitForTimeout(250);
}

async function click(page: Page, target: Locator): Promise<void> {
  await reach(page, target);
  await target.click();
}

async function type(page: Page, target: Locator, text: string): Promise<void> {
  await click(page, target);
  await target.pressSequentially(text, { delay: 45 });
}

test('record the demo video', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: size,
    recordVideo: { dir: 'demo-output/raw', size },
  });
  await context.addInitScript(addOverlay, { caption: CAPTION_ID, cursor: CURSOR_ID });
  const page = await context.newPage();
  const main = page.getByRole('navigation', { name: 'Main' });
  const plant = 'Komatsu WA480 Loader';
  const [failedItem, ...passedItems] = CHECKLIST_ITEMS;

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Log in to SiteCheck' })).toBeVisible();
  await say(page, 'SiteCheck: inspection records for heavy plant on a mine site', 3500);

  await say(page, 'An inspector logs in', 1200);
  await type(page, page.getByLabel('Email'), inspector.email);
  await type(page, page.getByLabel('Password'), E2E_PASSWORD);
  await click(page, page.getByRole('button', { name: 'Log in' }));
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

  await snap(page, 'dashboard');
  await say(page, 'The dashboard counts plants by status and lists inspections that are due');
  await reach(page, page.getByRole('list', { name: 'Plants by status' }));
  await page.waitForTimeout(1500);

  await click(page, main.getByRole('link', { name: 'Plants' }));
  await expect(page.getByRole('heading', { name: 'Plants', level: 1 })).toBeVisible();
  await say(page, 'Every plant, with search, filters and sorting', 2400);
  await type(page, page.getByRole('searchbox'), 'Komatsu');
  await page.waitForTimeout(800);
  await click(page, page.getByRole('link', { name: plant, exact: true }));
  await expect(page.getByRole('heading', { name: plant, level: 1 })).toBeVisible();
  await expect(page.getByText('Active', { exact: true })).toBeVisible();
  await say(page, 'This loader is Active. The inspector starts an inspection');

  await click(page, page.getByRole('link', { name: 'Inspect' }));
  await expect(page.getByRole('heading', { name: `Inspect ${plant}` })).toBeVisible();
  await say(page, 'Each checklist item passes or fails', 2000);
  for (const item of passedItems) {
    await click(page, page.getByRole('radiogroup', { name: item }).getByLabel('Pass'));
  }
  await click(page, page.getByRole('radiogroup', { name: failedItem }).getByLabel('Fail'));

  await say(page, 'One item fails. Saving without a comment is refused', 1800);
  await click(page, page.getByRole('button', { name: 'Save inspection' }));
  await expect(page.getByText('Say what is wrong.')).toBeVisible();
  await reach(page, page.getByText('Say what is wrong.'));
  await page.waitForTimeout(1500);

  await type(page, page.getByLabel(`Comment on ${failedItem}`), 'Hydraulic hose is leaking.');
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await snap(page, 'inspection-form');
  await click(page, page.getByRole('button', { name: 'Save inspection' }));
  await expect(page.getByText('Inspection failed. Its status is now Repair.')).toBeVisible();
  await say(page, 'Saved: a failed inspection puts the plant in Repair', 3200);

  const changes = page.getByRole('list', { name: 'Changes' });
  await expect(changes.getByText('Status changed from Active to Repair')).toBeVisible();
  // After the history has loaded, or the full-page shot cuts it off.
  await snap(page, 'plant-history', true);
  await reach(page, changes);
  await say(page, 'Who changed what, and when, is kept as history', 3200);

  await click(page, page.getByRole('button', { name: 'Log out' }));
  await expect(page.getByRole('heading', { name: 'Log in to SiteCheck' })).toBeVisible();
  await say(page, 'Visitors get a read-only demo account, one click away', 2400);
  await click(page, page.getByRole('button', { name: 'Try the read-only demo' }));
  await expect(page.getByText('Viewer (read-only)')).toBeVisible();
  await reach(page, page.getByText('Viewer (read-only)'));
  await say(page, 'The viewer can look at everything, but has no buttons to change anything');

  await click(page, main.getByRole('link', { name: 'Plants' }));
  await expect(page.getByRole('heading', { name: 'Plants', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add plant' })).toBeHidden();
  await page.waitForTimeout(1500);

  await type(page, page.getByRole('searchbox'), 'Komatsu');
  await click(page, page.getByRole('link', { name: plant, exact: true }));
  await expect(page.getByRole('heading', { name: plant, level: 1 })).toBeVisible();
  await expect(page.getByText('Repair', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Inspect' })).toBeHidden();
  await say(page, 'The same loader, now in Repair. No Inspect button for a viewer');

  await page.goto(`${new URL(page.url()).pathname}/inspect`);
  await expect(page.getByText('This account can only view plants')).toBeVisible();
  await say(
    page,
    'Even the form’s address shows no form, and the API refuses changes with 403',
    4000,
  );

  await context.close();
  const video = page.video();
  if (!video) throw new Error('The context was not recording.');
  await video.saveAs(output);
  // saveAs copies; the raw file under a random name is not needed.
  await video.delete();
});
