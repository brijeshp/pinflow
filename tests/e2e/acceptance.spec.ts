import { test, expect } from '@playwright/test';

// Helper: Playwright auto-pierces shadow DOM, so we can use regular selectors.
const CONTROL = 'button.control';
const ANNOTATE_BTN = 'button:has-text("Add comment")';
const EXPORT_BTN = 'button:has-text("Export & share")';
const PIN = 'button.pin';
const TEXTAREA = '[data-pinflow-root] textarea';
const SAVE_BUTTON = '[data-pinflow-root] button.save';

// §11.1 — Script tag enables annotation with no config beyond data-project
test('AC1: script tag auto-inits annotation', async ({ page }) => {
  await page.goto('/?reviewer=Alice');
  await expect(page.locator('[data-pinflow-root]')).toBeAttached();
  await expect(page.locator(CONTROL)).toBeVisible();
});

// §11.2 — Click element, type comment, persists across reload
test('AC2: pin + comment persists across reload', async ({ page }) => {
  await page.goto('/?reviewer=Alice');
  await page.locator(CONTROL).click();
  await page.locator(ANNOTATE_BTN).click();
  await page.locator('[data-testid="primary-cta"]').click({ force: true });
  await page.locator(TEXTAREA).fill('Needs more contrast');
  await page.locator(SAVE_BUTTON).click();
  await page.waitForTimeout(300);

  await page.goto('/?reviewer=Alice');
  await page.waitForTimeout(500);
  await expect(page.locator(PIN)).toHaveCount(1);
});

// §11.3 — Comments persist across SPA route changes
test('AC3: comments persist across SPA routes', async ({ page }) => {
  await page.goto('/?reviewer=Bob');
  await page.locator(CONTROL).click();
  await page.locator(ANNOTATE_BTN).click();
  await page.locator('h1').click({ force: true });
  await page.locator(TEXTAREA).fill('Fix heading');
  await page.locator(SAVE_BUTTON).click();
  await page.waitForTimeout(300);

  // Navigate to /pricing
  await page.locator('a[href="/pricing"]').click();
  await page.waitForTimeout(300);
  await expect(page.locator(PIN)).toHaveCount(0);

  // Back to home
  await page.locator('a[href="/"]').click();
  await page.waitForTimeout(300);
  await expect(page.locator(PIN)).toHaveCount(1);
});

// §11.4 — Second reviewer sees only their own comments
test('AC4: reviewer isolation', async ({ page }) => {
  await page.goto('/?reviewer=Alice');
  await page.locator(CONTROL).click();
  await page.locator(ANNOTATE_BTN).click();
  await page.locator('h1').click({ force: true });
  await page.locator(TEXTAREA).fill('Alice comment');
  await page.locator(SAVE_BUTTON).click();
  await page.waitForTimeout(300);

  await page.goto('/?reviewer=Bob');
  await page.waitForTimeout(500);
  await expect(page.locator(PIN)).toHaveCount(0);
});

// §11.5 — Reviewer export downloads markdown
test('AC5: reviewer export', async ({ page }) => {
  await page.goto('/?reviewer=Eve');
  await page.locator(CONTROL).click();
  await page.locator(ANNOTATE_BTN).click();
  await page.locator('[data-testid="primary-cta"]').click({ force: true });
  await page.locator(TEXTAREA).fill('Export test comment');
  await page.locator(SAVE_BUTTON).click();
  await page.waitForTimeout(300);

  await page.locator(CONTROL).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator(EXPORT_BTN).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^pinflow-feedback-Eve-e2e-test-.+\.md$/);
});

// §11.6 — Builder mode shows all reviewers' comments
test('AC6: builder mode aggregates', async ({ page }) => {
  // Alice
  await page.goto('/?reviewer=Alice');
  await page.locator(CONTROL).click();
  await page.locator(ANNOTATE_BTN).click();
  await page.locator('h1').click({ force: true });
  await page.locator(TEXTAREA).fill('Alice says hi');
  await page.locator(SAVE_BUTTON).click();
  await page.waitForTimeout(300);

  // Bob
  await page.goto('/?reviewer=Bob');
  await page.locator(CONTROL).click();
  await page.locator(ANNOTATE_BTN).click();
  await page.locator('[data-testid="primary-cta"]').click({ force: true });
  await page.locator(TEXTAREA).fill('Bob says hi');
  await page.locator(SAVE_BUTTON).click();
  await page.waitForTimeout(300);

  // Builder
  await page.goto('/?mode=builder');
  await page.waitForTimeout(500);
  await expect(page.locator(PIN)).toHaveCount(2);
});

// §11.8 — Markdown is agent-readable
test('AC8: export markdown has selector candidates and element context', async ({ page }) => {
  await page.goto('/?reviewer=Zara');
  await page.locator(CONTROL).click();
  await page.locator(ANNOTATE_BTN).click();
  await page.locator('[data-testid="primary-cta"]').click({ force: true });
  await page.locator(TEXTAREA).fill('Check this');
  await page.locator(SAVE_BUTTON).click();
  await page.waitForTimeout(300);

  await page.locator(CONTROL).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator(EXPORT_BTN).click(),
  ]);
  const path = await download.path();
  const fs = await import('node:fs/promises');
  const md = await fs.readFile(path!, 'utf-8');

  expect(md).toContain('# Feedback for e2e-test — from Zara');
  expect(md).toContain('**Selector candidates:**');
  expect(md).toContain('testid: `primary-cta`');
  expect(md).toContain('> Check this');
});

// §11.9 — Pins stay anchored on resize
test('AC9: pins anchored after resize', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/?reviewer=Resize');
  await page.locator(CONTROL).click();
  await page.locator(ANNOTATE_BTN).click();
  await page.locator('[data-testid="primary-cta"]').click({ force: true });
  await page.locator(TEXTAREA).fill('resize me');
  await page.locator(SAVE_BUTTON).click();
  await page.waitForTimeout(300);

  const pin = page.locator(PIN);
  await expect(pin).toBeVisible();

  await page.setViewportSize({ width: 800, height: 600 });
  await page.waitForTimeout(500);
  await expect(pin).toBeVisible();
});

// §11.11 — Bundle loads without error
test('AC11: IIFE bundle loads without error', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?reviewer=BundleTest');
  expect(errors).toHaveLength(0);
  const hasPinflow = await page.evaluate(
    () => !!(window as unknown as Record<string, unknown>).Pinflow,
  );
  expect(hasPinflow).toBe(true);
});
