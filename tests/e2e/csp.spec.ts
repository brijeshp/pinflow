import { test, expect } from '@playwright/test';

// Durable strict-CSP coverage (0.4.1 review "proof and test gaps" + post-merge
// F9). /csp serves a fixture under `default-src 'self'; script-src 'self';
// style-src 'self'; style-src-attr 'none'`. Under that policy an injected
// <style> is dropped — and because the host's pointer-events:none arrives via
// CSSOM (unrestricted) while every pointer-events:auto lives in the sheet, a
// dropped sheet means an invisible, NON-interactive overlay, not an unstyled
// one. These tests fail in that world: the dock would be invisible, the click
// would time out, and the violation listener would fire.

test('AC-CSP1: widget adopts a constructed sheet under strict CSP — no fallback, no violations', async ({
  page,
}) => {
  const violations: string[] = [];
  page.on('console', (msg) => {
    if (/content security policy/i.test(msg.text())) violations.push(msg.text());
  });
  await page.goto('/csp?reviewer=Cora');
  await expect(page.locator('[data-pinflow-root]')).toBeAttached();

  const channel = await page.evaluate(() => {
    const shadow = document.querySelector('[data-pinflow-root]')!.shadowRoot!;
    return {
      adopted: shadow.adoptedStyleSheets.length,
      styleNodes: shadow.querySelectorAll('style').length,
    };
  });
  expect(channel.adopted).toBe(1);
  expect(channel.styleNodes).toBe(0);
  expect(violations).toEqual([]);
});

test('AC-CSP2: widget is visible and interactive under strict CSP', async ({ page }) => {
  await page.goto('/csp?reviewer=Cora');
  const arm = page.locator('button.arm');
  await expect(arm).toBeVisible();
  // The real interactivity proof: arm the dock, pin an element, see the
  // composer. Every step needs pointer-events:auto delivered by the sheet.
  await arm.click();
  await page.locator('[data-testid="primary-cta"]').click({ force: true });
  await expect(page.locator('[data-pinflow-root] textarea')).toBeVisible();
});
