import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Handle, PinflowConfig } from '../../src/core/index';

const ARM = 'button.arm';
const TEXTAREA = '[data-pinflow-root] textarea';
const SAVE = '[data-pinflow-root] button.save';
const PIN = '[data-pinflow-root] button.pin';

type ReviewWindow = Window & {
  Pinflow: { init(config: PinflowConfig): Handle };
  integrityHandle: Handle;
};

async function initReview(page: Page) {
  await page.evaluate(() => {
    const win = window as unknown as ReviewWindow;
    win.integrityHandle = win.Pinflow.init({ project: 'target-integrity', reviewer: 'Integrity' });
  });
}

async function exportedComment(page: Page) {
  return page.evaluate(() => {
    const win = window as unknown as ReviewWindow;
    return JSON.parse(win.integrityHandle.exportJSON()).comments[0];
  });
}

async function expectPinOver(page: Page, target: Locator) {
  await expect(page.locator(PIN)).toBeVisible();
  await expect
    .poll(async () => {
      const pin = await page.locator(PIN).boundingBox();
      const control = await target.boundingBox();
      return (
        !!pin &&
        !!control &&
        pin.x + pin.width / 2 >= control.x - 2 &&
        pin.x + pin.width / 2 <= control.x + control.width + 2 &&
        pin.y + pin.height / 2 >= control.y - 2 &&
        pin.y + pin.height / 2 <= control.y + control.height + 2
      );
    })
    .toBe(true);
}

test('a duplicate textless checkbox parks when its named row disappears and recovers on return', async ({
  page,
}) => {
  await page.goto('/?reviewer=Integrity');
  await page.evaluate(() => {
    document.querySelector('#app')!.innerHTML =
      '<table><tbody>' +
      ['Avery Reed', 'Blair Stone', 'Casey Lake']
        .map(
          (name) =>
            `<tr><td>${name}</td><td><input type="checkbox" data-testid="row-select"></td></tr>`,
        )
        .join('') +
      '</tbody></table>';
  });
  await initReview(page);
  const selected = page.locator('tr').filter({ hasText: 'Blair Stone' }).locator('input');
  await page.locator(ARM).click();
  await selected.click({ force: true });
  await page.locator(TEXTAREA).fill('Check this patient selection');
  await page.locator(SAVE).click();
  await expectPinOver(page, selected);
  const originalUrl = page.url();

  await page.evaluate(() => {
    document.querySelectorAll('tr')[1]!.remove();
  });
  expect(page.url()).toBe(originalUrl);
  await expect(page.locator(PIN)).toBeHidden();
  await expect(page.locator(PIN)).toHaveAttribute('data-orphaned', 'true');

  await page.evaluate(() => {
    const row = document.createElement('tr');
    row.innerHTML = '<td>Blair Stone</td><td><input type="checkbox" data-testid="row-select"></td>';
    document.querySelector('tbody')!.insertBefore(row, document.querySelectorAll('tr')[1] ?? null);
  });
  await expectPinOver(page, selected);
});

test('a nested dialog Save span preserves its layer beneath a workspace test id', async ({
  page,
}) => {
  await page.goto('/?reviewer=Integrity');
  await page.evaluate(() => {
    document.querySelector('main')!.setAttribute('data-testid', 'workspace');
    document.querySelector('#app')!.innerHTML =
      '<div role="dialog" aria-label="Edit patient">' +
      '<h2>Edit patient</h2><button id="patient-save"><span>Save</span></button></div>';
  });
  await initReview(page);
  await page.locator(ARM).click();
  await page.locator('#patient-save span').click({ force: true });
  await page.locator(TEXTAREA).fill('Keep the edited patient');
  await page.locator(SAVE).click();

  const comment = await exportedComment(page);
  expect(comment.anchor.layer).toEqual({ role: 'dialog', name: 'Edit patient' });
  expect(comment.anchor.context.name).toBe('Save');
  expect(comment.anchor.textFingerprint).toBe('Save');
  await expectPinOver(page, page.locator('#patient-save'));
  await page.evaluate(() => document.querySelector('[role="dialog"]')!.remove());
  await expect(page.locator(PIN)).toBeHidden();
  await expect(page.locator(PIN)).toHaveAttribute('data-orphaned', 'true');
});

for (const saveMethod of ['click', 'keyboard'] as const) {
  test(`a native modal supports ordinary composer ${saveMethod} save and restores after Escape and close`, async ({
    page,
  }) => {
    await page.goto('/?reviewer=Integrity');
    await initReview(page);
    await page.locator(ARM).click();
    await page.evaluate(() => {
      const dialog = document.createElement('dialog');
      dialog.id = 'native-integrity';
      dialog.setAttribute('aria-label', 'Patient settings');
      dialog.innerHTML = '<button id="native-patient-save">Save patient</button>';
      document.body.append(dialog);
      dialog.showModal();
    });
    await page.locator('#native-patient-save').click({ force: true });
    // These must receive real user input despite the host dialog making the page inert.
    await page.locator(TEXTAREA).fill('Retain these settings');
    if (saveMethod === 'click') await page.locator(SAVE).click();
    else await page.locator(TEXTAREA).press('Control+Enter');
    await expect(page.locator(TEXTAREA)).toHaveCount(0);
    expect((await exportedComment(page)).text).toBe('Retain these settings');

    await page.locator(PIN).click();
    await page.locator(TEXTAREA).fill('Unsaved edit');
    await page.locator(TEXTAREA).press('Escape');
    await expect(page.locator(TEXTAREA)).toHaveCount(0);
    expect((await exportedComment(page)).text).toBe('Retain these settings');
    await page.evaluate(() =>
      (document.querySelector('#native-integrity') as HTMLDialogElement).close(),
    );
    await expect(page.locator(PIN)).toBeHidden();
    await expect(page.locator(ARM)).toBeVisible();
    await page.evaluate(() =>
      (document.querySelector('#native-integrity') as HTMLDialogElement).showModal(),
    );
    await expectPinOver(page, page.locator('#native-patient-save'));
    await page.locator(PIN).click();
    await expect(page.locator(TEXTAREA)).toHaveValue('Retain these settings');
  });
}

test('an open shadow control retains its inner identity and attachment through reload', async ({
  page,
}) => {
  // addInitScript also reconstructs the host before Pinflow hydrates on reload.
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const host = document.createElement('patient-actions');
      host.id = 'patient-actions';
      host.style.cssText = 'display:block;margin:30px;width:260px';
      host.attachShadow({ mode: 'open' }).innerHTML =
        '<button data-testid="shadow-save" style="padding:14px">Save patient</button>';
      document.querySelector('#app')!.append(host);
    });
  });
  await page.goto('/?reviewer=Integrity');
  await initReview(page);
  const control = page.locator('patient-actions button');
  await page.locator(ARM).click();
  await control.click({ force: true });
  await page.locator(TEXTAREA).fill('Keep this shadow action');
  await page.locator(SAVE).click();
  const comment = await exportedComment(page);
  expect(comment.anchor.context.name).toBe('Save patient');
  expect(comment.anchor.textFingerprint).toBe('Save patient');
  await expectPinOver(page, control);

  await page.reload();
  await initReview(page);
  await expectPinOver(page, control);
  expect((await exportedComment(page)).text).toBe('Keep this shadow action');
});

test('nested open-shadow inputs use their own labels and retain identity after re-init', async ({
  page,
}) => {
  await page.goto('/?reviewer=Integrity');
  await page.evaluate(() => {
    const app = document.querySelector('#app')!;
    app.innerHTML = '<label for="notify">Outer decoy</label><input id="notify" type="checkbox">';
    const outer = document.createElement('patient-panel');
    outer.id = 'patient-panel';
    outer.style.cssText = 'display:block;padding:30px';
    const outerRoot = outer.attachShadow({ mode: 'open' });
    const inner = document.createElement('patient-options');
    inner.id = 'patient-options';
    inner.style.cssText = 'display:block;padding:30px';
    inner.attachShadow({ mode: 'open' }).innerHTML =
      '<label for="notify">Notify patient</label><input id="notify" type="checkbox">';
    outerRoot.append(inner);
    app.append(outer);
  });
  await initReview(page);
  const input = page.locator('patient-panel patient-options input');
  await page.locator(ARM).click();
  await input.click();
  await page.locator(TEXTAREA).fill('Keep notifications on this patient');
  await page.locator(SAVE).click();
  expect((await exportedComment(page)).anchor.context.name).toBe('Notify patient');
  await expectPinOver(page, input);
  await initReview(page);
  await expectPinOver(page, input);
  expect((await exportedComment(page)).anchor.context.name).toBe('Notify patient');
});

test('mutations inside nested open shadow roots park and restore their saved pin', async ({
  page,
}) => {
  await page.goto('/?reviewer=Integrity');
  await page.evaluate(() => {
    const outer = document.createElement('patient-panel');
    outer.id = 'patient-panel';
    outer.style.cssText = 'display:block;padding:30px';
    const inner = document.createElement('patient-actions');
    inner.id = 'patient-actions';
    inner.style.cssText = 'display:block;padding:30px';
    inner.attachShadow({ mode: 'open' }).innerHTML =
      '<button id="shadow-confirm" style="padding:14px">Confirm patient</button>';
    outer.attachShadow({ mode: 'open' }).append(inner);
    document.querySelector('#app')!.append(outer);
  });
  await initReview(page);
  const control = page.locator('patient-panel patient-actions button');
  await page.locator(ARM).click();
  await control.click();
  await page.locator(TEXTAREA).fill('Confirm only this patient');
  await page.locator(SAVE).click();
  await expectPinOver(page, control);
  await page.evaluate(() => {
    document
      .querySelector('patient-panel')!
      .shadowRoot!.querySelector('patient-actions')!
      .shadowRoot!.querySelector('button')!
      .remove();
  });
  await expect(page.locator(PIN)).toBeHidden();
  await expect(page.locator(PIN)).toHaveAttribute('data-orphaned', 'true');
  await page.evaluate(() => {
    document
      .querySelector('patient-panel')!
      .shadowRoot!.querySelector('patient-actions')!.shadowRoot!.innerHTML =
      '<div style="height:80px"></div><button id="shadow-confirm" style="padding:14px">Confirm patient</button>';
  });
  await expectPinOver(page, control);
});

test('nested native modal save follows the active dialog through close and reopen', async ({
  page,
}) => {
  await page.goto('/?reviewer=Integrity');
  await page.evaluate(() => {
    const open = document.createElement('button');
    open.id = 'open-outer-native';
    open.textContent = 'Open patient';
    const outer = document.createElement('dialog');
    outer.id = 'outer-native';
    outer.setAttribute('aria-label', 'Patient record');
    outer.innerHTML =
      '<button id="open-inner-native">Open details</button><button id="close-outer-native">Close patient</button>';
    const inner = document.createElement('dialog');
    inner.id = 'inner-native';
    inner.setAttribute('aria-label', 'Patient details');
    inner.innerHTML =
      '<button id="nested-native-save">Save details</button><button id="close-inner-native">Close details</button>';
    outer.append(inner);
    document.body.append(open, outer);
    open.addEventListener('click', () => outer.showModal());
    outer.querySelector('#open-inner-native')!.addEventListener('click', () => inner.showModal());
    outer.querySelector('#close-outer-native')!.addEventListener('click', () => outer.close());
    inner.querySelector('#close-inner-native')!.addEventListener('click', () => inner.close());
  });
  await initReview(page);
  await page.locator('#open-outer-native').click();
  await page.locator('#open-inner-native').click();
  await page.locator(ARM).click();
  await page.locator('#nested-native-save').click();
  await page.locator(TEXTAREA).fill('Save these patient details');
  await page.locator(SAVE).click();
  expect((await exportedComment(page)).anchor.layer).toEqual({
    role: 'dialog',
    name: 'Patient details',
  });
  await expectPinOver(page, page.locator('#nested-native-save'));
  await page.locator('#close-inner-native').click();
  await expect(page.locator(PIN)).toBeHidden();
  await page.locator('#open-inner-native').click();
  await expectPinOver(page, page.locator('#nested-native-save'));
  await page.locator(PIN).click();
  await expect(page.locator(TEXTAREA)).toHaveValue('Save these patient details');
  await page.locator(TEXTAREA).press('Escape');
  // Dismissing the comment editor must not also cancel its host modal.
  await expect(page.locator('#inner-native')).toHaveJSProperty('open', true);
  await page.locator('#close-inner-native').click();
  await page.locator('#close-outer-native').click();
  await expect(page.locator(PIN)).toBeHidden();
  await page.locator('#open-outer-native').click();
  await page.locator('#open-inner-native').click();
  await expectPinOver(page, page.locator('#nested-native-save'));
});

test('reordering and recycling a repeated row preserves entity identity without refresh', async ({
  page,
}) => {
  await page.goto('/?reviewer=Integrity');
  await page.evaluate(() => {
    document.querySelector('#app')!.innerHTML =
      '<ul>' +
      ['Avery Reed', 'Blair Stone', 'Casey Lake']
        .map(
          (name) =>
            `<li data-testid="patient-row" style="padding:15px"><span>${name}</span><input type="checkbox" data-testid="row-select"></li>`,
        )
        .join('') +
      '</ul>';
  });
  await initReview(page);
  const selected = page.locator('li').filter({ hasText: 'Blair Stone' }).locator('input');
  await page.locator(ARM).click();
  await selected.click();
  await page.locator(TEXTAREA).fill('This patient needs review');
  await page.locator(SAVE).click();
  await expectPinOver(page, selected);
  const originalUrl = page.url();
  await page.evaluate(() => {
    const list = document.querySelector('ul')!;
    list.append(list.querySelectorAll('li')[1]!);
  });
  await expectPinOver(page, selected);
  await page.evaluate(() => {
    document.querySelector('ul')!.lastElementChild!.querySelector('span')!.textContent =
      'Dana West';
  });
  await expect(page.locator(PIN)).toBeHidden();
  await expect(page.locator(PIN)).toHaveAttribute('data-orphaned', 'true');
  await page.evaluate(() => {
    document.querySelector('ul')!.lastElementChild!.querySelector('span')!.textContent =
      'Blair Stone';
  });
  await expectPinOver(page, selected);
  expect(page.url()).toBe(originalUrl);
});

test('a native modal in an open shadow root supports composer save and Escape', async ({
  page,
}) => {
  await page.goto('/?reviewer=Integrity');
  await page.evaluate(() => {
    const host = document.createElement('patient-widget');
    host.id = 'widget';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML =
      '<dialog id="shadow-native" aria-label="Patient preferences">' +
      '<button id="shadow-native-save">Save preferences</button>' +
      '<button id="shadow-native-close">Close preferences</button></dialog>';
    const dialog = shadow.querySelector('dialog')!;
    shadow.querySelector('#shadow-native-close')!.addEventListener('click', () => dialog.close());
    document.querySelector('#app')!.append(host);
  });
  await initReview(page);
  await page.locator(ARM).click();
  await page.evaluate(() => {
    document.querySelector('#widget')!.shadowRoot!.querySelector('dialog')!.showModal();
  });
  await page.locator('#shadow-native-save').click();
  await page.locator(TEXTAREA).fill('Preserve patient preferences');
  await page.locator(SAVE).click();
  expect((await exportedComment(page)).anchor.layer).toEqual({
    role: 'dialog',
    name: 'Patient preferences',
  });
  await expectPinOver(page, page.locator('#shadow-native-save'));
  await page.locator(PIN).click();
  await page.locator(TEXTAREA).fill('Unsaved preferences edit');
  await page.locator(TEXTAREA).press('Escape');
  await expect(page.locator(TEXTAREA)).toHaveCount(0);
  await expect(page.locator('#shadow-native')).toHaveJSProperty('open', true);
  expect((await exportedComment(page)).text).toBe('Preserve patient preferences');
  await page.locator('#shadow-native-close').click();
  await expect(page.locator(PIN)).toBeHidden();
  await expect(page.locator(ARM)).toBeVisible();
});

test('identical placeholder cards keep their pin at placement and through reload, and park once a lookalike is filtered', async ({
  page,
}) => {
  // The card count survives reload through sessionStorage so the filtered
  // list can be hydrated against, not just mutated live.
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      document.querySelector('#app')!.innerHTML =
        '<ul>' +
        '<li style="padding:15px"><h3>Product name</h3><button style="padding:12px">Buy</button></li>'.repeat(
          Number(sessionStorage.getItem('cards') ?? 3),
        ) +
        '</ul>';
    });
  });
  await page.goto('/?reviewer=Integrity');
  await initReview(page);
  const second = page.locator('li').nth(1).locator('button');
  await page.locator(ARM).click();
  await second.click();
  await page.locator(TEXTAREA).fill('Make this Buy button primary');
  await page.locator(SAVE).click();
  // The element under the cursor is the strongest identity there is: a
  // lookalike row must never park the pin the moment it is placed.
  await expectPinOver(page, second);
  expect((await exportedComment(page)).anchor.owner).toMatchObject({ ordinal: 1, count: 3 });

  await page.reload();
  await initReview(page);
  await expectPinOver(page, second);

  // Live, the pin stays on the very node the reviewer clicked; once that node
  // must be re-found from selectors, a changed lookalike count parks it.
  await page.evaluate(() => {
    document.querySelector('li')!.remove();
    sessionStorage.setItem('cards', '2');
  });
  await expectPinOver(page, page.locator('li').nth(0).locator('button'));
  await page.reload();
  await initReview(page);
  await expect(page.locator(PIN)).toHaveAttribute('data-orphaned', 'true');
  await expect(page.locator(PIN)).toBeHidden();
});

test('a transformed native modal keeps pins on target and its chrome inside the dialog box', async ({
  page,
}) => {
  await page.goto('/?reviewer=Integrity');
  await initReview(page);
  await page.evaluate(() => {
    const dialog = document.createElement('dialog');
    dialog.id = 'moved-native';
    dialog.setAttribute('aria-label', 'Patient notes');
    // Any transform makes the dialog the containing block for fixed
    // descendants, which is where the overlay has to live to stay interactive.
    dialog.style.cssText =
      'transform:translate(60px,90px);margin:0;padding:24px;border:4px solid;width:520px;height:360px';
    dialog.innerHTML = '<button id="moved-native-save" style="padding:14px">Save notes</button>';
    document.body.append(dialog);
    dialog.showModal();
  });
  await page.locator(ARM).click();
  await page.locator('#moved-native-save').click({ force: true });
  await page.locator(TEXTAREA).fill('Keep these notes');
  await page.locator(SAVE).click();
  await expectPinOver(page, page.locator('#moved-native-save'));
  // The dialog's UA overflow clips its fixed descendants to its box, so the
  // dock and the composer live inside that box while the pin stays on target.
  const box = (await page.locator('#moved-native').boundingBox())!;
  const inside = (r: { x: number; y: number; width: number; height: number }) =>
    r.x >= box.x - 1 &&
    r.y >= box.y - 1 &&
    r.x + r.width <= box.x + box.width + 1 &&
    r.y + r.height <= box.y + box.height + 1;
  expect(inside((await page.locator(ARM).boundingBox())!)).toBe(true);
  await page.locator(PIN).click();
  await expect(page.locator(TEXTAREA)).toHaveValue('Keep these notes');
  expect(inside((await page.locator(TEXTAREA).boundingBox())!)).toBe(true);
  await page.locator(TEXTAREA).press('Escape');
  await page.evaluate(() => (document.querySelector('#moved-native') as HTMLDialogElement).close());
  await expect(page.locator(PIN)).toBeHidden();
  await expect(page.locator(ARM)).toBeVisible();
});

test('the overlay survives its host dialog re-rendering its children', async ({ page }) => {
  await page.goto('/?reviewer=Integrity');
  await initReview(page);
  await page.evaluate(() => {
    const dialog = document.createElement('dialog');
    dialog.id = 'rerender-native';
    dialog.innerHTML = '<button id="rerender-save" style="padding:14px">Save</button>';
    document.body.append(dialog);
    dialog.showModal();
  });
  await page.locator(ARM).click();
  await page.locator('#rerender-save').click({ force: true });
  await page.locator(TEXTAREA).fill('Survive a re-render');
  await page.locator(SAVE).click();
  await expectPinOver(page, page.locator('#rerender-save'));
  // A framework that owns the dialog's children may replace them wholesale,
  // taking the foreign overlay host with them.
  await page.evaluate(() => {
    const dialog = document.querySelector('#rerender-native')!;
    dialog.innerHTML = '<button id="rerender-save" style="padding:14px">Save</button>';
  });
  await expectPinOver(page, page.locator('#rerender-save'));
  await page.locator(PIN).click();
  await expect(page.locator(TEXTAREA)).toHaveValue('Survive a re-render');
});
