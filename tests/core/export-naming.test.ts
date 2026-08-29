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

  it('carries the name through a clear made from the confirmation', async () => {
    annotator = openSheet(HANDLE);
    const field = nameField()!;
    field.value = 'Sam';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    clickButton('Export & share');
    await new Promise((r) => setTimeout(r, 0));
    // Disposition lives a panel later now, so the settled name has to survive
    // the gap. Clearing the PRE-rename key would leave the corpus behind under
    // the old handle and silently resurrect it on the next visit.
    let t = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => (t += 700)); // past the arming swallow window
    clickButton('Clear comments');
    clickButton('Clear 1 comment?');

    expect(localStorage.getItem(`pinflow:r:${PROJECT}`)).toBe('Sam');
    expect(loadStore(localStorage, PROJECT, 'Sam')?.comments).toHaveLength(0);
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

// ---------------------------------------------------------------------------
// 0.7.0 review findings #3 — #7. Each of these was a terminal or continuity
// path that the first six tests never touched.
// ---------------------------------------------------------------------------

interface Extra {
  onSubmit?: (payload: { reviewer: string }) => void;
  source?: () => Promise<Comment[]>;
}

function makeAnnotatorWith(reviewer: string, extra: Extra): Annotator {
  return new Annotator({
    config: {
      project: PROJECT,
      // 'auto' switches the chip OFF when `source` is set; these tests drive
      // the sheet, so the affordance has to exist regardless.
      exportUi: 'always',
      ...(extra.onSubmit ? { onSubmit: extra.onSubmit as never } : {}),
      ...(extra.source ? { source: extra.source } : {}),
    },
    reviewer,
    mode: 'reviewer',
    storage: localStorage,
  });
}

function roots(): ShadowRoot[] {
  return [...document.querySelectorAll('[data-pinflow-root]')]
    .map((h) => (h as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot)
    .filter((s): s is ShadowRoot => s !== null);
}

function seed(reviewer: string, comments: Comment[]): void {
  saveStore(localStorage, { ...emptyStore(PROJECT, reviewer), comments });
}

describe('terminal paths and continuity after a rename', () => {
  let annotator: Annotator | null = null;
  let second: Annotator | null = null;

  beforeEach(() => {
    // Capture the artifact actually handed to download(), so assertions read
    // what the reviewer would receive rather than re-deriving it.
    (window as unknown as { __blob: Blob | undefined }).__blob = undefined;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b: Blob | MediaSource) => {
      (window as unknown as { __blob?: Blob }).__blob = b as Blob;
      return 'blob:mock';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  afterEach(() => {
    annotator?.destroy();
    second?.destroy();
    annotator = second = null;
    localStorage.clear();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  // #4 — Send to builder is the sheet's other terminal action. It read the
  // store directly, so the name the reviewer had just typed never reached it.
  it('#4 Send to builder submits under the typed name and moves the corpus', async () => {
    seed(HANDLE, [makeComment('cmt_1', 'note')]);
    let payload: { reviewer: string } | null = null;
    annotator = makeAnnotatorWith(HANDLE, {
      onSubmit: (p) => {
        payload = p;
      },
    });
    const root = roots()[0]!;
    root.querySelector<HTMLButtonElement>('button.chip')!.click();
    const field = root.querySelector<HTMLInputElement>('input.name')!;
    field.value = 'Brijesh';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    [...root.querySelectorAll('button')].find((b) => b.textContent === 'Send to builder')!.click();
    await new Promise((r) => setTimeout(r, 0));

    expect(payload).not.toBeNull();
    expect((payload as unknown as { reviewer: string }).reviewer).toBe('Brijesh');
    expect(localStorage.getItem(`pinflow:r:${PROJECT}`)).toBe('Brijesh');
    expect(loadStore(localStorage, PROJECT, 'Brijesh')?.comments).toHaveLength(1);
    expect(localStorage.getItem(storageKey(PROJECT, HANDLE))).toBeNull();
  });

  // #5 — the field's own label says it is included in the export. Clearing it
  // must therefore remove it from the export, without destroying the identity
  // the corpus is filed under.
  it('#5 clearing a prefilled name drops attribution without renaming anything', async () => {
    seed('Brijesh', [makeComment('cmt_1', 'note')]);
    annotator = makeAnnotatorWith('Brijesh', {});
    const root = roots()[0]!;
    root.querySelector<HTMLButtonElement>('button.chip')!.click();
    const field = root.querySelector<HTMLInputElement>('input.name')!;
    expect(field.value).toBe('Brijesh'); // prefilled
    field.value = '';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    [...root.querySelectorAll('button')].find((b) => b.textContent === 'Export & share')!.click();
    await new Promise((r) => setTimeout(r, 0));

    const md = await (window as unknown as { __blob?: Blob }).__blob?.text();
    expect(md).toBeDefined();
    expect(md).not.toContain('Brijesh');
    // Export-scoped only: the corpus is still filed under the real name.
    expect(loadStore(localStorage, PROJECT, 'Brijesh')?.comments).toHaveLength(1);
    expect(localStorage.getItem(`pinflow:r:${PROJECT}`)).not.toBe('');
  });

  it('#5 the confirmation retry does not resurrect the cleared name', async () => {
    seed('Brijesh', [makeComment('cmt_1', 'note')]);
    annotator = makeAnnotatorWith('Brijesh', {});
    const root = roots()[0]!;
    root.querySelector<HTMLButtonElement>('button.chip')!.click();
    const field = root.querySelector<HTMLInputElement>('input.name')!;
    field.value = '';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    [...root.querySelectorAll('button')].find((b) => b.textContent === 'Export & share')!.click();
    await new Promise((r) => setTimeout(r, 0));

    // The sheet is gone and _nameEl is null; a rebuild here would read the
    // stored identity and undo the reviewer's opt-out.
    [...root.querySelectorAll('button')]
      .find((b) => b.textContent === 'Download Feedback Markdown')!
      .click();
    await new Promise((r) => setTimeout(r, 0));
    const md = await (window as unknown as { __blob?: Blob }).__blob?.text();
    expect(md).not.toContain('Brijesh');
  });

  // #6 — folding into an existing corpus changes what should be on screen.
  it('#6 comments merged in from the target become visible immediately', async () => {
    seed(HANDLE, [makeComment('cmt_new', 'from the handle')]);
    seed('Brijesh', [makeComment('cmt_old', 'from the name')]);
    annotator = makeAnnotatorWith(HANDLE, {});
    const root = roots()[0]!;
    expect(root.querySelectorAll('button.pin')).toHaveLength(1);

    root.querySelector<HTMLButtonElement>('button.chip')!.click();
    const field = root.querySelector<HTMLInputElement>('input.name')!;
    field.value = 'Brijesh';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    [...root.querySelectorAll('button')].find((b) => b.textContent === 'Export & share')!.click();
    await new Promise((r) => setTimeout(r, 0));

    expect(root.querySelectorAll('button.pin')).toHaveLength(2);
    expect(root.querySelector('button.chip')?.textContent).toBe('2');
  });

  // #7 — `reviewer` is a display label. Changing it must not cancel a read
  // that was already in flight for the same person's corpus.
  it('#7 a rename does not discard an in-flight source hydration', async () => {
    seed(HANDLE, [makeComment('cmt_local', 'local')]);
    let release: (c: Comment[]) => void = () => {};
    const pending = new Promise<Comment[]>((r) => {
      release = r;
    });
    annotator = makeAnnotatorWith(HANDLE, { source: () => pending });

    const root = roots()[0]!;
    root.querySelector<HTMLButtonElement>('button.chip')!.click();
    const field = root.querySelector<HTMLInputElement>('input.name')!;
    field.value = 'Brijesh';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    [...root.querySelectorAll('button')].find((b) => b.textContent === 'Export & share')!.click();
    await new Promise((r) => setTimeout(r, 0));

    release([makeComment('cmt_server', 'from the server')]);
    await new Promise((r) => setTimeout(r, 0));

    const ids = (loadStore(localStorage, PROJECT, 'Brijesh')?.comments ?? []).map((c) => c.id);
    expect([...ids].sort()).toEqual(['cmt_local', 'cmt_server']);
  });

  // #3 — two tabs. A rename in one retires the key the other is still writing
  // to, and identity resolution will never look at that key again.
  it('#3 a second tab folds its later writes into the renamed corpus', async () => {
    seed(HANDLE, [makeComment('cmt_a', 'a')]);
    annotator = makeAnnotatorWith(HANDLE, {}); // tab A
    second = makeAnnotatorWith(HANDLE, {}); // tab B, same corpus

    const tabA = roots()[0]!;
    tabA.querySelector<HTMLButtonElement>('button.chip')!.click();
    const field = tabA.querySelector<HTMLInputElement>('input.name')!;
    field.value = 'Brijesh';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    [...tabA.querySelectorAll('button')].find((b) => b.textContent === 'Export & share')!.click();
    await new Promise((r) => setTimeout(r, 0));

    // Tab B, unaware, writes a new comment under the retired handle.
    (second as unknown as { _store: { comments: Comment[] } })._store.comments.push(
      makeComment('cmt_b', 'b'),
    );
    (second as unknown as { _persist: () => void })._persist();

    // Neither comment may be stranded where identity resolution won't look.
    const named = (loadStore(localStorage, PROJECT, 'Brijesh')?.comments ?? []).map((c) => c.id);
    expect([...named].sort()).toEqual(['cmt_a', 'cmt_b']);
    expect(localStorage.getItem(storageKey(PROJECT, HANDLE))).toBeNull();
  });
});

// The sheet's Enter affordance had no coverage — all the other sheet tests
// click a button, so the keydown path could have rotted unnoticed.
describe('Enter in the name field exports', () => {
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

  it('names the reviewer and exports without touching a button', async () => {
    annotator = openSheet(HANDLE);
    const field = nameField()!;
    field.value = 'Brijesh';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));

    expect(localStorage.getItem(`pinflow:r:${PROJECT}`)).toBe('Brijesh');
    expect(loadStore(localStorage, PROJECT, 'Brijesh')?.comments).toHaveLength(1);
  });
});
