import { test, expect } from '@playwright/test';
import type { Handle, PinflowConfig } from '../../src/core/index';

test('structured feedback survives composer save, reload and JSON export', async ({
  page,
}, testInfo) => {
  await page.goto('/?reviewer=Evidence');
  await page.evaluate(() => {
    const win = window as unknown as {
      Pinflow: { init(config: PinflowConfig): Handle };
      evidenceHandle: Handle;
    };
    win.evidenceHandle = win.Pinflow.init({
      project: 'e2e-evidence',
      reviewer: 'Evidence',
      expectedOutcome: true,
      captureContext: () => ({
        build: 'preview-42',
        state: 'home',
        steps: ['Open home', 'Select Get started'],
        acceptance: ['Signup opens'],
      }),
    });
  });
  await page.locator('button.arm').click();
  await page.locator('[data-testid="primary-cta"]').click({ force: true });
  await page.locator('[data-pinflow-root] textarea').first().fill('The button does nothing');
  await page.getByRole('textbox', { name: 'Expected outcome' }).fill('Signup opens');
  await expect(page.getByRole('textbox', { name: 'Expected outcome' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('expected-outcome.png') });
  await page.locator('button.save').click();
  await page.locator('button.pin').click();
  await expect(page.getByRole('textbox', { name: 'Expected outcome' })).toHaveValue('Signup opens');
  const exported = await page.evaluate(() =>
    JSON.parse((window as unknown as { evidenceHandle: Handle }).evidenceHandle.exportJSON()),
  );
  expect(exported.comments[0].feedback).toEqual({
    build: 'preview-42',
    state: 'home',
    steps: ['Open home', 'Select Get started'],
    acceptance: ['Signup opens'],
    expected: 'Signup opens',
  });
  await page.reload();
  await page.evaluate(() => {
    (window as unknown as { Pinflow: { init(config: PinflowConfig): Handle } }).Pinflow.init({
      project: 'e2e-evidence',
      reviewer: 'Evidence',
    });
  });
  await page.locator('button.pin').click();
  await expect(page.getByRole('textbox', { name: 'Expected outcome' })).toHaveValue('Signup opens');
});
