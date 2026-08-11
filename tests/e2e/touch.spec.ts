import { test, expect, devices } from '@playwright/test';

// REAL touch input, in a real engine.
//
// This file exists because its absence hid seven P1 defects through nine review
// rounds. `acceptance.spec.ts` drives everything through `page.mouse` and
// `locator.click()`, which synthesize MOUSE input — so the "mobile" projects
// exercised exactly the same code path as desktop Chrome, and the entire touch
// activation grammar (long-press, compatibility mouse events, the trailing
// click) had no coverage anywhere outside happy-dom.
//
// `page.touchscreen` / `tap()` produce genuine touch events, including the
// compatibility mouse burst the browser synthesizes at lift. That burst is the
// substrate of the defects this file guards.

test.use({ ...devices['Pixel 5'] });

const CONTROL = 'button.arm';
const PIN = 'button.pin';
const TEXTAREA = '[data-pinflow-root] textarea';
const SAVE_BUTTON = '[data-pinflow-root] button.save';

// Records every event a host page would see, so an assertion can be about the
// HOST's experience rather than pinflow's internal state.
async function spyHost(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __hostEvents: string[] };
    w.__hostEvents = [];
    for (const type of ['click', 'mousedown', 'mouseup']) {
      window.addEventListener(
        type,
        (e) => {
          // Ignore anything on pinflow's own chrome — only host-page hits count.
          // hasAttribute, NOT getAttribute: getAttribute returns null on a
          // miss, and `null !== undefined` is true, so a getAttribute-based
          // filter discards every event and the spy silently records nothing.
          const path = e.composedPath();
          if (path.some((n) => (n as Element)?.hasAttribute?.('data-pinflow-root'))) return;
          w.__hostEvents.push(type);
        },
        false,
      );
    }
  });
}

async function hostEvents(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __hostEvents: string[] }).__hostEvents);
}

// A long-press is the entire mobile activation grammar. It had no E2E test.
test('touch long-press places a pin', async ({ page }) => {
  await page.goto('/?reviewer=Touchy');
  await page.locator(CONTROL).waitFor();
  const box = (await page.locator('h1').boundingBox())!;
  await page.touchscreen.tap(box.x + 5, box.y + 5); // wake the page
  // Long-press: down, hold past the threshold, up.
  await page.evaluate(
    (pt: { x: number; y: number }) => {
      const el = document.elementFromPoint(pt.x, pt.y)!;
      el.dispatchEvent(
        new PointerEvent('pointerdown', {
          pointerId: 1,
          pointerType: 'touch',
          clientX: pt.x,
          clientY: pt.y,
          bubbles: true,
        }),
      );
    },
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
  await page.waitForTimeout(600); // past LONG_PRESS_MS
  await page.evaluate(
    (pt: { x: number; y: number }) => {
      const el = document.elementFromPoint(pt.x, pt.y)!;
      el.dispatchEvent(
        new PointerEvent('pointerup', {
          pointerId: 1,
          pointerType: 'touch',
          clientX: pt.x,
          clientY: pt.y,
          bubbles: true,
        }),
      );
    },
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
  await expect(page.locator(TEXTAREA)).toBeVisible();
  await page.locator(TEXTAREA).fill('placed by touch');
  await page.locator(SAVE_BUTTON).click();
  await expect(page.locator(PIN)).toHaveCount(1);
});

// The host must not also receive the gesture. A real tap on a host control
// while armed is the everyday case: the reviewer points at a button to comment
// on it, and the button must not fire.
test('an armed tap on a host control does not operate it', async ({ page }) => {
  await page.goto('/?reviewer=Touchy');
  await page.locator(CONTROL).waitFor();
  await spyHost(page);
  await page.locator(CONTROL).click(); // arm
  const target = page.locator('[data-testid="primary-cta"]');
  const box = (await target.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator(TEXTAREA)).toBeVisible(); // pinflow took it
  expect(await hostEvents(page)).toEqual([]); // …and the host saw nothing
});

// Regression guard for the defect where a hold longer than the swallow window
// let the compatibility click through to the host page.
test('a LONG armed hold still keeps its click from the host', async ({ page }) => {
  await page.goto('/?reviewer=Touchy');
  await page.locator(CONTROL).waitFor();
  await spyHost(page);
  await page.locator(CONTROL).click();
  const box = (await page.locator('[data-testid="primary-cta"]').boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.touchscreen.tap(x, y);
  await page.waitForTimeout(1500); // well past any swallow window
  expect(await hostEvents(page)).toEqual([]);
});

// CONTROL: the spy must be capable of recording. Without this, a filter bug
// that silently discards every event would make the assertions above pass on
// completely broken code — the exact failure mode this file was added to end.
test('control: the host spy records a tap when pinflow is NOT armed', async ({ page }) => {
  await page.goto('/?reviewer=Touchy');
  await page.locator(CONTROL).waitFor();
  await spyHost(page);
  const box = (await page.locator('[data-testid="primary-cta"]').boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  expect(await hostEvents(page)).toContain('click');
});
