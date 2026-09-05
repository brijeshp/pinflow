import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

// A pin taken inside a modal is bound to that layer (0.12.0). In a real
// engine: the MutationObserver + rAF path must park the pin the moment the
// dialog unmounts — no scroll, no resize — and bring it back on reopen, and
// the heal ladder must never attach it to the page underneath.

const CONTROL = 'button.arm';
const TEXTAREA = '[data-pinflow-root] textarea';
const SAVE_BUTTON = '[data-pinflow-root] button.save';
const PIN = '[data-pinflow-root] button.pin';

test('a dialog pin parks when the dialog unmounts and returns when it reopens', async ({
  page,
}) => {
  await page.goto('/?reviewer=Chiara');
  await page.locator('#open-dialog').click();
  await page.locator(CONTROL).click();
  await page.locator('#dialog-save').click({ force: true });
  await page.locator(TEXTAREA).fill('roster is wrong');
  await page.locator(SAVE_BUTTON).click();
  await expect(page.locator(PIN)).toBeVisible();

  await page.locator('#close-dialog').click();
  // The page still has a "Get started" CTA with the same class: heal must not take it.
  await expect(page.locator(PIN)).toBeHidden();
  await expect(page.locator(PIN)).toHaveAttribute('data-orphaned', 'true');

  await page.locator('#open-dialog').click();
  await expect(page.locator(PIN)).toBeVisible();
  // It came back INSIDE the dialog: the pin sits over the dialog's Save button.
  const pin = await page.locator(PIN).boundingBox();
  const save = await page.locator('#dialog-save').boundingBox();
  expect(pin && save && pin.x >= save.x - 20 && pin.x <= save.x + save.width + 20).toBe(true);
});

test('the export names the layer, and a closed dialog reads as parked', async ({ page }) => {
  await page.goto('/?reviewer=Chiara2');
  await page.locator('#open-dialog').click();
  await page.locator(CONTROL).click();
  await page.locator('#dialog-save').click({ force: true });
  await page.locator(TEXTAREA).fill('roster is wrong');
  await page.locator(SAVE_BUTTON).click();
  await page.locator('#close-dialog').click();
  await expect(page.locator(PIN)).toBeHidden();
  await page.locator('button.chip').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('button:has-text("Export & share")').click(),
  ]);
  const md = readFileSync((await download.path())!, 'utf8');
  expect(md).toContain('## Orphaned comments');
  expect(md).toContain('**Layer:** dialog ‘Add Patients’ (parked)');
});
