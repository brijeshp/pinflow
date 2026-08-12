import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyStore, loadStore, saveStore, storageKey } from '../../src/core/storage';
import { routeKey } from '../../src/core/route-key';
import type { Comment } from '../../src/core/types';
import { Annotator } from '../../src/core/ui/annotator';

const PROJECT = 'p';
const HANDLE = 'anon_k3f9x1abq';

function shadow(): ShadowRoot {
  const host = document.querySelector('[data-pinflow-root]');
  if (!host?.shadowRoot) throw new Error('pinflow root not mounted');
  return host.shadowRoot;
}

function makeComment(id: string, text: string): Comment {
  return {
    id,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    route: routeKey(),
    fullUrl: window.location.href,
    text,
    modality: 'text',
    anchor: {
      selectors: { testid: null, id: null, css: 'body', xpath: '/html/body' },
      textFingerprint: '',
      positionPercent: { x: 50, y: 50 },
      viewport: { width: 800, height: 600 },
    },
  };
}

function makeAnnotator(reviewer: string): Annotator {
  return new Annotator({
    config: { project: PROJECT },
    reviewer,
    mode: 'reviewer',
    storage: localStorage,
  });
}

function nameField(): HTMLInputElement | null {
  return shadow().querySelector<HTMLInputElement>('input.name');
}

function clickButton(label: string): void {
  Array.from(shadow().querySelectorAll('button'))
    .find((b) => b.textContent === label)!
    .click();
}

function openSheet(reviewer: string): Annotator {
  saveStore(localStorage, {
    ...emptyStore(PROJECT, reviewer),
    comments: [makeComment('cmt_1', 'the upgrade button is losing')],
  });
  const a = makeAnnotator(reviewer);
  shadow().querySelector<HTMLButtonElement>('button.chip')!.click();
  return a;
}

// The export sheet is the one moment attribution matters, so it is the one
// moment pinflow asks. Everything before it runs on a minted handle.
describe('naming yourself at export', () => {
  let annotator: Annotator | null = null;

  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  afterEach(() => {
    annotator?.destroy();
    annotator = null;
    localStorage.clear();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('offers an empty, optional name field to an unnamed reviewer', () => {
    annotator = openSheet(HANDLE);
    const field = nameField();
    expect(field).not.toBeNull();
    // The internal handle is never shown back to the reviewer as their name.
    expect(field?.value).toBe('');
    expect(field?.placeholder.toLowerCase()).toContain('name');
  });

  it('prefills the name a reviewer already gave', () => {
    annotator = openSheet('Brijesh');
    expect(nameField()?.value).toBe('Brijesh');
  });

  it('attributes the export to the typed name and moves the corpus with it', async () => {
    annotator = openSheet(HANDLE);
    const field = nameField()!;
    field.value = 'Brijesh';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    clickButton('Export & share');
    await new Promise((r) => setTimeout(r, 0));

    expect(annotator.exportMarkdown()).toContain('— from Brijesh');
    // The comments moved with the name, rather than being stranded.
    expect(loadStore(localStorage, PROJECT, 'Brijesh')?.comments).toHaveLength(1);
    expect(localStorage.getItem(storageKey(PROJECT, HANDLE))).toBeNull();
    // Remembered, so the next visit opens already named.
    expect(localStorage.getItem(`pinflow:r:${PROJECT}`)).toBe('Brijesh');
  });

  it('exports without attribution when the field is left blank', async () => {
    annotator = openSheet(HANDLE);
    clickButton('Export & share');
    await new Promise((r) => setTimeout(r, 0));

    const md = annotator.exportMarkdown();
    expect(md).not.toContain('— from');
    expect(md).not.toContain(HANDLE);
    expect(md).toContain('the upgrade button is losing');
    // Skipping is not a rename: the corpus stays under the handle it had.
    expect(loadStore(localStorage, PROJECT, HANDLE)?.comments).toHaveLength(1);
  });

  it('carries the name through "Export & clear" too', async () => {
    annotator = openSheet(HANDLE);
    const field = nameField()!;
    field.value = 'Sam';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    clickButton('Export & clear');
    await new Promise((r) => setTimeout(r, 0));

    expect(localStorage.getItem(`pinflow:r:${PROJECT}`)).toBe('Sam');
    // Cleared under the NEW name — a rename that left comments behind under the
    // old key would silently resurrect them on the next visit.
    expect(loadStore(localStorage, PROJECT, 'Sam')?.comments ?? []).toHaveLength(0);
    expect(localStorage.getItem(storageKey(PROJECT, HANDLE))).toBeNull();
  });

  it('ignores a whitespace-only name rather than storing one', async () => {
    annotator = openSheet(HANDLE);
    const field = nameField()!;
    field.value = '   ';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    clickButton('Export & share');
    await new Promise((r) => setTimeout(r, 0));

    expect(annotator.exportMarkdown()).not.toContain('— from');
    expect(loadStore(localStorage, PROJECT, HANDLE)?.comments).toHaveLength(1);
  });
});
