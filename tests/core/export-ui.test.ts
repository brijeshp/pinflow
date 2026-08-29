import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyStore, loadStore, renameReviewer, saveStore } from '../../src/core/storage';
import { routeKey } from '../../src/core/route-key';
import type { Comment } from '../../src/core/types';
import { Annotator } from '../../src/core/ui/annotator';

const PROJECT = 'p';
const REVIEWER = 'Tester';

function shadow(): ShadowRoot {
  const host = document.querySelector('[data-pinflow-root]');
  if (!host?.shadowRoot) throw new Error('pinflow root not mounted');
  return host.shadowRoot;
}

function makeComment(id: string, text: string, route?: string): Comment {
  return {
    id,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    route: route ?? routeKey(),
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

function seedStore(comments: Comment[]): void {
  saveStore(localStorage, { ...emptyStore(PROJECT, REVIEWER), comments });
}

function makeAnnotator(extra?: {
  exportUi?: 'auto' | 'always' | 'never';
  source?: () => Promise<Comment[]>;
  mode?: 'reviewer' | 'builder';
  activation?: { mode: 'toggle' | 'stealth' | 'both' };
  onChange?: (store: unknown, delta: { type: string; comment: Comment }) => void;
  onSubmit?: () => void;
  storage?: Storage;
}): Annotator {
  return new Annotator({
    config: {
      project: PROJECT,
      ...(extra?.exportUi ? { exportUi: extra.exportUi } : {}),
      ...(extra?.source ? { source: extra.source } : {}),
      ...(extra?.activation ? { activation: extra.activation } : {}),
      ...(extra?.onChange ? { onChange: extra.onChange as never } : {}),
      ...(extra?.onSubmit ? { onSubmit: extra.onSubmit } : {}),
    },
    reviewer: REVIEWER,
    mode: extra?.mode ?? 'reviewer',
    storage: extra?.storage ?? localStorage,
  });
}

function chip(): HTMLButtonElement | null {
  return shadow().querySelector<HTMLButtonElement>('button.chip');
}

function pointerTap(target: Element | Document): void {
  const opts = { bubbles: true, composed: true };
  target.dispatchEvent(new Event('pointerdown', opts));
  target.dispatchEvent(new Event('pointerup', opts));
}

describe('export UI — count chip gating (exportUi config)', () => {
  let annotator: Annotator | null = null;

  afterEach(() => {
    annotator?.destroy();
    annotator = null;
    localStorage.clear();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it("default 'auto' on a local-first install shows the chip once a comment exists", () => {
    seedStore([makeComment('c1', 'hello')]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    const c = chip();
    expect(c).not.toBeNull();
    expect(c?.textContent).toBe('1');
    expect(c?.getAttribute('aria-label')).toContain('1');
  });

  it("'auto' with a source configured hides the chip — synced hosts own collation", () => {
    seedStore([makeComment('c1', 'hello')]);
    annotator = makeAnnotator({
      activation: { mode: 'stealth' },
      source: () => Promise.resolve([]),
    });
    expect(chip()).toBeNull();
  });

  it("'never' hides the chip even on a local-first install", () => {
    seedStore([makeComment('c1', 'hello')]);
    annotator = makeAnnotator({ exportUi: 'never' });
    expect(chip()).toBeNull();
  });

  it("'always' shows the chip even with a source configured", () => {
    seedStore([makeComment('c1', 'hello')]);
    annotator = makeAnnotator({
      exportUi: 'always',
      source: () => Promise.resolve([]),
    });
    expect(chip()).not.toBeNull();
  });

  // Builder mode has no on-page export surface: `_exportUiEnabled()` has always
  // excluded it, and 0.9.0 removed the drawer that used to stand in. The
  // aggregate is reached through the handle, which is what a host embedding
  // builder mode already owns — `exportUi: 'always'` cannot conjure one.
  it('builder mode shows no chip; its aggregate is reached through the handle', () => {
    seedStore([makeComment('c1', 'hello')]);
    annotator = makeAnnotator({ mode: 'builder', exportUi: 'always' });
    expect(chip()).toBeNull();
    expect(shadow().querySelector('.drawer')).toBeNull();
    expect(JSON.parse(annotator.exportJSON()).comments).toHaveLength(1);
  });
});

describe('export UI — chip lifecycle', () => {
  let annotator: Annotator | null = null;

  afterEach(() => {
    annotator?.destroy();
    annotator = null;
    localStorage.clear();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('no comments → no chip; the first saved comment pops it in', () => {
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    expect(chip()).toBeNull();

    // Stealth gesture → popup → type → Save: the full creation path.
    const down = new Event('pointerdown', { bubbles: true, composed: true }) as Event & {
      pointerType?: string;
      altKey?: boolean;
      clientX?: number;
      clientY?: number;
    };
    Object.assign(down, { pointerType: 'mouse', altKey: true, clientX: 20, clientY: 20 });
    document.body.dispatchEvent(down);
    const up = new Event('pointerup', { bubbles: true, composed: true });
    Object.assign(up, { pointerType: 'mouse', clientX: 20, clientY: 20 });
    document.body.dispatchEvent(up);
    // A real Alt+click's own trailing click consumes the gesture's one-click
    // swallow; synthetic pointerdown leaves it armed, so feed it one.
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    const ta = shadow().querySelector('textarea');
    expect(ta).not.toBeNull();
    ta!.value = 'first!';
    shadow().querySelector<HTMLButtonElement>('button.save')!.click();

    expect(chip()?.textContent).toBe('1');
    const stored = JSON.parse(localStorage.getItem('pinflow:c:p:Tester') ?? '{}');
    expect(stored.comments?.[0]?.text).toBe('first!'); // the save itself landed
  });

  it('count tracks deletes and unmounts at zero (sheet closes too)', () => {
    seedStore([makeComment('c1', 'one'), makeComment('c2', 'two')]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    expect(chip()?.textContent).toBe('2');

    chip()!.click(); // open the sheet so we can watch it close at zero
    expect(shadow().querySelector('.panel')).not.toBeNull();

    for (let i = 0; i < 2; i++) {
      shadow().querySelector<HTMLDivElement>('.pin')?.click();
      shadow().querySelector<HTMLButtonElement>('button.delete')?.click();
    }
    expect(chip()).toBeNull();
    expect(shadow().querySelector('.panel')).toBeNull();
  });
});

describe('export UI — sheet flow', () => {
  let annotator: Annotator | null = null;

  afterEach(() => {
    annotator?.destroy();
    annotator = null;
    localStorage.clear();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  function openSheet(): void {
    seedStore([makeComment('c1', 'one', '/a'), makeComment('c2', 'two', '/b')]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    chip()!.click();
  }

  it('chip tap opens an anchored sheet with count, screens, and Export', () => {
    openSheet();
    const panel = shadow().querySelector('.panel');
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain('2 comments');
    expect(panel?.textContent).toContain('2 screens');
    const buttons = Array.from(panel!.querySelectorAll('button')).map((b) => b.textContent);
    expect(buttons).toContain('Export & share');
  });

  it('chip tap toggles the sheet closed', () => {
    openSheet();
    chip()!.click();
    expect(shadow().querySelector('.panel')).toBeNull();
  });

  it('Export runs the existing artifact path and shows the confirmation', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    openSheet();
    const exportBtn = Array.from(shadow().querySelectorAll('button')).find(
      (b) => b.textContent === 'Export & share',
    );
    exportBtn!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(URL.createObjectURL).toHaveBeenCalled();
    // Confirmation panel replaces the sheet (spec §5.6 flow, reused verbatim).
    const done = Array.from(shadow().querySelectorAll('button')).find(
      (b) => b.textContent === 'Done',
    );
    expect(done).not.toBeNull();
    done!.click();
    expect(shadow().querySelector('.panel')).toBeNull();
  });

  it('a completed outside tap dismisses the sheet; a bare pointerdown does not', async () => {
    openSheet();
    await new Promise((r) => setTimeout(r, 0)); // arm (next task, matching popup semantics)
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    expect(shadow().querySelector('.panel')).not.toBeNull();
    document.body.dispatchEvent(new Event('pointerup', { bubbles: true, composed: true }));
    expect(shadow().querySelector('.panel')).toBeNull();
  });

  it('stealth without the chip (auto + source) has no sheet path at all', () => {
    seedStore([makeComment('c1', 'one')]);
    annotator = makeAnnotator({
      activation: { mode: 'stealth' },
      source: () => Promise.resolve([]),
    });
    expect(chip()).toBeNull();
    expect(shadow().querySelector('.panel')).toBeNull();
  });
});

describe('export UI — draft popup tertiary action', () => {
  let annotator: Annotator | null = null;

  afterEach(() => {
    annotator?.destroy();
    annotator = null;
    localStorage.clear();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  function openPopup(): HTMLTextAreaElement {
    shadow().querySelector<HTMLDivElement>('.pin')!.click();
    return shadow().querySelector('textarea')!;
  }

  it('the popup actions row offers "Export all · n" when the affordance is on', () => {
    seedStore([makeComment('c1', 'one'), makeComment('c2', 'two')]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    openPopup();
    const link = shadow().querySelector<HTMLButtonElement>('.input .exportall');
    expect(link).not.toBeNull();
    expect(link?.textContent).toBe('Export all · 2');
  });

  it('tapping it SAVES the typed draft, then opens the sheet', () => {
    seedStore([makeComment('c1', 'original')]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    const ta = openPopup();
    ta.value = 'edited before export';
    shadow().querySelector<HTMLButtonElement>('.input .exportall')!.click();

    expect(shadow().querySelector('.input')).toBeNull(); // popup closed via save
    expect(shadow().querySelector('.panel')).not.toBeNull(); // sheet open
    const stored = JSON.parse(localStorage.getItem('pinflow:c:p:Tester') ?? '{}');
    expect(stored.comments?.[0]?.text).toBe('edited before export');
  });

  it('gated off (auto + source): the popup has no export link', () => {
    seedStore([makeComment('c1', 'one')]);
    annotator = makeAnnotator({
      activation: { mode: 'stealth' },
      source: () => Promise.resolve([]),
    });
    openPopup();
    expect(shadow().querySelector('.input .exportall')).toBeNull();
  });
});

describe('export UI — hotkey (⌘/Ctrl+Shift+E)', () => {
  let annotator: Annotator | null = null;

  afterEach(() => {
    annotator?.destroy();
    annotator = null;
    localStorage.clear();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  function chord(): void {
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'E', metaKey: true, shiftKey: true, bubbles: true }),
    );
  }

  it('opens the sheet, and toggles it closed on a second press', () => {
    seedStore([makeComment('c1', 'one')]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    chord();
    expect(shadow().querySelector('.panel')).not.toBeNull();
    chord();
    expect(shadow().querySelector('.panel')).toBeNull();
  });

  it('inert with zero comments (chord left to the host), when gated off, and after destroy', () => {
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    const ev = new KeyboardEvent('keydown', {
      key: 'E',
      metaKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(ev);
    expect(shadow().querySelector('.panel')).toBeNull();
    // pinflow took no action, so the host keeps its shortcut (review #11).
    expect(ev.defaultPrevented).toBe(false);

    annotator.destroy();
    annotator = null;
    localStorage.clear();

    seedStore([makeComment('c1', 'one')]);
    annotator = makeAnnotator({
      activation: { mode: 'stealth' },
      source: () => Promise.resolve([]),
    });
    chord();
    expect(shadow().querySelector('.panel')).toBeNull();

    annotator.destroy();
    annotator = null;
    expect(() => chord()).not.toThrow(); // listener detached, nothing to hit
  });

  it('a bare E (no modifiers) never triggers', () => {
    seedStore([makeComment('c1', 'one')]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'E', bubbles: true }));
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'E', shiftKey: true, bubbles: true }),
    );
    expect(shadow().querySelector('.panel')).toBeNull();
  });
});

describe('export UI — review hardening (surface states, real pointer ordering)', () => {
  let annotator: Annotator | null = null;

  afterEach(() => {
    annotator?.destroy();
    annotator = null;
    localStorage.clear();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  const arm = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

  function chipPointerTap(): void {
    const c = chip()!;
    const opts = { bubbles: true, composed: true };
    c.dispatchEvent(new Event('pointerdown', opts));
    c.dispatchEvent(new Event('pointerup', opts));
    c.click();
  }

  it('#7: a physical chip tap (pointer events + click) closes its own open sheet', async () => {
    seedStore([makeComment('c1', 'one')]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    chip()!.click();
    expect(shadow().querySelector('.panel')).not.toBeNull();
    await arm();
    chipPointerTap();
    expect(shadow().querySelector('.panel')).toBeNull();
  });

  it('#3: a chip tap with an open TYPED draft saves it, then opens the sheet', async () => {
    seedStore([makeComment('c1', 'original')]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    shadow().querySelector<HTMLDivElement>('.pin')!.click();
    const ta = shadow().querySelector('textarea')!;
    ta.value = 'typed then exported';
    await arm();
    chipPointerTap();
    expect(shadow().querySelector('.input')).toBeNull();
    expect(shadow().querySelector('.panel')).not.toBeNull();
    const stored = JSON.parse(localStorage.getItem('pinflow:c:p:Tester') ?? '{}');
    expect(stored.comments?.[0]?.text).toBe('typed then exported');
  });

  it('#3: the hotkey with an open TYPED draft saves it, then opens the sheet', async () => {
    seedStore([makeComment('c1', 'original')]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    shadow().querySelector<HTMLDivElement>('.pin')!.click();
    const ta = shadow().querySelector('textarea')!;
    ta.value = 'chorded away';
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'E', metaKey: true, shiftKey: true, bubbles: true }),
    );
    expect(shadow().querySelector('.input')).toBeNull();
    expect(shadow().querySelector('.panel')).not.toBeNull();
    const stored = JSON.parse(localStorage.getItem('pinflow:c:p:Tester') ?? '{}');
    expect(stored.comments?.[0]?.text).toBe('chorded away');
  });

  it('#10: a held chord (repeat keydowns) does not strobe the sheet', () => {
    seedStore([makeComment('c1', 'one')]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    const press = (repeat: boolean): void => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'E',
          metaKey: true,
          shiftKey: true,
          bubbles: true,
          repeat,
        }),
      );
    };
    press(false);
    expect(shadow().querySelector('.panel')).not.toBeNull();
    press(true);
    press(true);
    expect(shadow().querySelector('.panel')).not.toBeNull(); // still open, not strobed
  });

  it('#4: summoning the sheet REPLACES an open confirmation instead of just closing it', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    seedStore([makeComment('c1', 'one')]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    chip()!.click();
    Array.from(shadow().querySelectorAll('button'))
      .find((b) => b.textContent === 'Export & share')!
      .click();
    await new Promise((r) => setTimeout(r, 0));
    expect(shadow().querySelector('.panel')?.textContent).toContain('Your feedback is ready');
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'E', metaKey: true, shiftKey: true, bubbles: true }),
    );
    const panel = shadow().querySelector('.panel');
    expect(panel?.textContent).toContain('1 comment');
    expect(panel?.textContent).not.toContain('Your feedback is ready');
  });

  // 0.4.1 P3. download() fires a DETACHED a.click() and returns void — no
  // event, no promise, so a completed save is not observable in general. In
  // iOS in-app webviews (Instagram, LinkedIn, Slack) it frequently no-ops,
  // which is precisely where the reviewer-on-a-phone moat puts people, and the
  // panel asserted success there anyway. Only the clipboard write is verified.
  // Returns the body copy and the whole panel separately. The distinction is
  // load-bearing since 0.5.1: the panel OFFERS a "Copy to Clipboard" button in
  // every state, so only the body paragraph can be read as a claim about what
  // actually happened. Matching /clipboard/ against the whole panel would now
  // be satisfied by the button label alone.
  async function exportAndReadPanel(
    clipboardWorks: boolean,
  ): Promise<{ all: string; body: string }> {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.stubGlobal(
      'navigator',
      Object.create(navigator, {
        clipboard: {
          value: clipboardWorks ? { writeText: () => Promise.resolve() } : undefined,
          configurable: true,
        },
      }),
    );
    seedStore([makeComment('c1', 'one')]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    chip()!.click();
    Array.from(shadow().querySelectorAll('button'))
      .find((b) => b.textContent === 'Export & share')!
      .click();
    await new Promise((r) => setTimeout(r, 0));
    const panel = shadow().querySelector('.panel');
    return {
      all: panel?.textContent ?? '',
      body: panel?.querySelector('p')?.textContent ?? '',
    };
  }

  it('#8: never claims the file was saved, and names the clipboard when it worked', async () => {
    const { all, body } = await exportAndReadPanel(true);
    expect(all).not.toMatch(/saved to your downloads/i);
    // The verified channel is worth naming, together with the recovery it
    // enables when the unverifiable one silently did nothing.
    expect(body).toMatch(/clipboard/i);
    expect(body).toMatch(/paste/i);
  });

  it('#9: without a clipboard, points at the download without asserting it landed', async () => {
    const { all, body } = await exportAndReadPanel(false);
    expect(all).not.toMatch(/saved to your downloads/i);
    // The BODY must not claim a clipboard that was never there — the offer of
    // a Copy button is not a claim that copying happened.
    expect(body).not.toMatch(/clipboard/i);
    expect(body).toMatch(/downloads/i);
  });

  it('#5: an open sheet refreshes its counts when the corpus changes', () => {
    // c1 on the CURRENT route (visible pin, deletable); c2 on another screen.
    seedStore([makeComment('c1', 'one'), makeComment('c2', 'two', '/b')]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    chip()!.click();
    expect(shadow().querySelector('.panel h3')?.textContent).toBe('2 comments · 2 screens');
    // Delete the visible-route comment through its pin popup while the sheet is up.
    shadow().querySelector<HTMLDivElement>('.pin')!.click();
    shadow().querySelector<HTMLButtonElement>('button.delete')!.click();
    expect(shadow().querySelector('.panel h3')?.textContent).toBe('1 comment · 1 screen');
  });

  it('#8: exporting the sole empty draft yields no sheet (nothing left to export)', () => {
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    const down = new Event('pointerdown', { bubbles: true, composed: true }) as Event & {
      pointerType?: string;
      altKey?: boolean;
    };
    Object.assign(down, { pointerType: 'mouse', altKey: true, clientX: 20, clientY: 20 });
    document.body.dispatchEvent(down);
    const up = new Event('pointerup', { bubbles: true, composed: true });
    Object.assign(up, { pointerType: 'mouse', clientX: 20, clientY: 20 });
    document.body.dispatchEvent(up);
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    const link = shadow().querySelector<HTMLButtonElement>('.input .exportall');
    expect(link?.textContent).toBe('Export all · 1'); // the empty draft itself
    link!.click();
    expect(shadow().querySelector('.panel')).toBeNull();
    expect(chip()).toBeNull();
    const stored = JSON.parse(localStorage.getItem('pinflow:c:p:Tester') ?? '{}');
    expect(stored.comments ?? []).toHaveLength(0);
  });

  it('destroy with the sheet open detaches its document listeners', async () => {
    seedStore([makeComment('c1', 'one')]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    chip()!.click();
    await arm();
    annotator.destroy();
    annotator = null;
    expect(() => {
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
      document.body.dispatchEvent(new Event('pointerup', { bubbles: true, composed: true }));
    }).not.toThrow();
  });
});

describe('late clipboard vs closed surfaces (review #23, r2)', () => {
  let annotator: Annotator | null = null;

  afterEach(() => {
    annotator?.destroy();
    annotator = null;
    localStorage.clear();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('closing the sheet before the clipboard resolves suppresses the confirmation entirely', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    let releaseClipboard!: (v: boolean) => void;
    const gate = new Promise<boolean>((r) => (releaseClipboard = r));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => gate.then(() => undefined) },
      configurable: true,
    });
    seedStore([makeComment('c1', 'one')]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    chip()!.click(); // sheet open
    Array.from(shadow().querySelectorAll('button'))
      .find((b) => b.textContent === 'Export & share')!
      .click();
    chip()!.click(); // user closes the sheet while the clipboard hangs
    expect(shadow().querySelector('.panel')).toBeNull();
    releaseClipboard(true);
    await new Promise((r) => setTimeout(r, 0));
    // No stale confirmation resurrects over the closed surface:
    expect(shadow().querySelector('.panel')).toBeNull();
  });
});

// Disposition moved here from the export sheet (0.10.0 UX pass). The sheet
// asked "export, or export and wipe?" BEFORE either channel had run, which is a
// decision without its evidence: download() fires a detached a.click() and
// returns void, so a reviewer in an in-app webview could authorise the wipe and
// receive nothing. The confirmation is the first moment delivery is knowable,
// so it is the only honest place to offer the wipe.
//
// The wipe is REVISION-SCOPED (0.10.0 review #1): it removes exactly the
// revisions the artifact was built from — updatedAt AND the server-owned
// status/resolution, which PROTOCOL moves without an updatedAt bump — so a
// comment added, edited, or dispositioned after the export survives. "The
// exported file is unaffected" stays true by construction, not by hope.
describe('reviewer batch controls — post-export disposition (clear after delivery)', () => {
  let annotator: Annotator | null = null;

  afterEach(() => {
    annotator?.destroy();
    annotator = null;
    localStorage.clear();
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function buttons(): HTMLButtonElement[] {
    return [...shadow().querySelectorAll('button')];
  }
  function byLabel(label: string): HTMLButtonElement | undefined {
    return buttons().find((b) => b.textContent === label);
  }
  function body(): string {
    return shadow().querySelector('.panel p')?.textContent ?? '';
  }

  // The two-tap confirm swallows a second activation inside its arming window
  // (one physical gesture must never be both taps — 0.10.0 review #1). Tests
  // legitimately confirm step a fake clock past the window per call.
  function spacedClock(): void {
    let t = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => (t += 700));
  }

  // Records every clipboard write so a re-copy can be proved to carry the
  // ALREADY-BUILT artifact rather than a rebuild from the (possibly wiped) store.
  function captureClipboard(impl?: (t: string) => Promise<void>): string[] {
    const writes: string[] = [];
    vi.stubGlobal(
      'navigator',
      Object.create(navigator, {
        clipboard: {
          value: {
            writeText: (t: string) => {
              writes.push(t);
              return impl ? impl(t) : Promise.resolve();
            },
          },
          configurable: true,
        },
      }),
    );
    return writes;
  }

  function captureBlobs(): Blob[] {
    const blobs: Blob[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b: Blob | MediaSource) => {
      blobs.push(b as Blob);
      return 'blob:mock';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    return blobs;
  }

  async function exportToConfirmation(): Promise<void> {
    chip()!.click();
    byLabel('Export & share')!.click();
    await new Promise((r) => setTimeout(r, 0));
  }

  it('the sheet no longer forks on clear: one export action, no destructive branch', () => {
    captureBlobs();
    seedStore([makeComment('c1', 'a')]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    chip()!.click();
    expect(byLabel('Export & share')).toBeDefined();
    expect(byLabel('Export & clear')).toBeUndefined();
    // Nor does it move the same destructive act onto the sheet under a new name.
    expect(byLabel('Clear comments')).toBeUndefined();
  });

  it('the confirmation offers clear, and the first click arms rather than wipes', async () => {
    captureBlobs();
    captureClipboard();
    seedStore([makeComment('c1', 'a'), makeComment('c2', 'b')]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    await exportToConfirmation();

    expect(byLabel('Clear comments')).toBeDefined();
    byLabel('Clear comments')!.click();

    expect(loadStore(localStorage, PROJECT, REVIEWER)?.comments).toHaveLength(2);
    expect(byLabel('Clear 2 comments?')).toBeDefined();
    // The only question a reviewer actually has at this point.
    expect(body()).toContain('The exported file is unaffected');
  });

  it('when the clipboard was unavailable, the armed warning says the file is the only copy', async () => {
    captureBlobs();
    // No clipboard at all (http context): copied=false — delivery is unverifiable,
    // so the armed copy must carry the risk instead of the reassurance. Stubbed
    // explicitly: an earlier describe leaks a WORKING clipboard onto the shared
    // navigator via defineProperty, so absence must be forced, not assumed.
    vi.stubGlobal(
      'navigator',
      Object.create(navigator, { clipboard: { value: undefined, configurable: true } }),
    );
    seedStore([makeComment('c1', 'a')]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    await exportToConfirmation();
    byLabel('Clear comments')!.click();
    expect(body()).toContain('Check the file downloaded first');
    expect(body()).not.toContain('The exported file is unaffected');
  });

  it('one physical gesture cannot be both taps: a double-tap arms but never wipes', async () => {
    captureBlobs();
    captureClipboard();
    seedStore([makeComment('c1', 'a')]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    await exportToConfirmation();

    const clr = byLabel('Clear comments')!;
    clr.click(); // arm (real clock)
    clr.click(); // same gesture, ~0ms later — inside the swallow window
    expect(loadStore(localStorage, PROJECT, REVIEWER)?.comments).toHaveLength(1);
    expect(byLabel('Clear 1 comment?')).toBeDefined(); // still armed, not spent
  });

  it('any other panel action disarms: a Copy click returns the control to resting', async () => {
    captureBlobs();
    captureClipboard();
    spacedClock();
    seedStore([makeComment('c1', 'a')]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    await exportToConfirmation();

    byLabel('Clear comments')!.click();
    expect(byLabel('Clear 1 comment?')).toBeDefined();
    byLabel('Copy to Clipboard')!.click();
    expect(byLabel('Clear comments')).toBeDefined();
    expect(byLabel('Clear 1 comment?')).toBeUndefined();
    const store = loadStore(localStorage, PROJECT, REVIEWER);
    expect(store?.comments).toHaveLength(1);
  });

  it('a slow re-copy resolving after the arm cannot overwrite the armed warning', async () => {
    captureBlobs();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const writes = captureClipboard(() => gate);
    spacedClock();
    seedStore([makeComment('c1', 'a')]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    // The export's own copy also rides the gate — release it for the export,
    // then re-gate for the retry.
    const exporting = exportToConfirmation();
    release();
    await exporting;
    await new Promise((r) => setTimeout(r, 0));

    let releaseRetry!: () => void;
    const retryGate = new Promise<void>((r) => (releaseRetry = r));
    writes.length = 0;
    captureClipboard(() => retryGate);

    byLabel('Copy to Clipboard')!.click(); // starts a slow write
    byLabel('Clear comments')!.click(); // arms — the warning is now the status
    expect(body()).toContain('Deletes your 1 comment');
    releaseRetry();
    await new Promise((r) => setTimeout(r, 0));
    // The stale "Copied to your clipboard." must not replace the destructive
    // warning at the decision moment (0.10.0 review #1).
    expect(body()).toContain('Deletes your 1 comment');
  });

  it('the second click wipes the store, removes the pins, and emits a delete per comment', async () => {
    captureBlobs();
    captureClipboard();
    spacedClock();
    seedStore([makeComment('c1', 'a'), makeComment('c2', 'b')]);
    const deltas: string[] = [];
    annotator = makeAnnotator({
      activation: { mode: 'stealth' },
      onChange: (_s, d) => deltas.push(`${d.type}:${d.comment.id}`),
    });
    await exportToConfirmation();

    byLabel('Clear comments')!.click();
    byLabel('Clear 2 comments?')!.click();

    expect(loadStore(localStorage, PROJECT, REVIEWER)?.comments ?? []).toHaveLength(0);
    expect(shadow().querySelectorAll('button.pin')).toHaveLength(0);
    expect(deltas.sort()).toEqual(['delete:c1', 'delete:c2']);
    expect(body()).toContain('cleared');
    // Spent, and gone: no second wipe to arm.
    expect(byLabel('Clear comments')).toBeUndefined();
  });

  it('pluralises the armed label for a single comment', async () => {
    captureBlobs();
    captureClipboard();
    seedStore([makeComment('c1', 'a')]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    await exportToConfirmation();
    byLabel('Clear comments')!.click();
    expect(byLabel('Clear 1 comment?')).toBeDefined();
  });

  // The batch is frozen in the same synchronous block as the artifact: a merge
  // landing inside the export's clipboard await is already outside it (0.10.0
  // review #2 — the await-window corridor).
  it('feedback arriving while the export clipboard is pending is outside the batch', async () => {
    captureBlobs();
    let releaseCopy!: () => void;
    const copyGate = new Promise<void>((r) => (releaseCopy = r));
    captureClipboard(() => copyGate);
    spacedClock();
    let resolveSource!: (c: Comment[]) => void;
    seedStore([makeComment('c1', 'exported one')]);
    const deltas: string[] = [];
    annotator = makeAnnotator({
      activation: { mode: 'stealth' },
      exportUi: 'always',
      source: () => new Promise<Comment[]>((r) => (resolveSource = r)),
      onChange: (_s, d) => deltas.push(`${d.type}:${d.comment.id}`),
    });
    chip()!.click();
    byLabel('Export & share')!.click(); // artifact + batch freeze HERE
    resolveSource([makeComment('c9', 'landed mid-copy')]); // inside the await
    await new Promise((r) => setTimeout(r, 0));
    releaseCopy();
    await new Promise((r) => setTimeout(r, 0));

    byLabel('Clear comments')!.click();
    expect(byLabel('Clear 1 comment?')).toBeDefined(); // c9 is not in the batch
    byLabel('Clear 1 comment?')!.click();
    const kept = loadStore(localStorage, PROJECT, REVIEWER)?.comments ?? [];
    expect(kept.map((c) => c.id)).toEqual(['c9']);
    expect(deltas.filter((d) => d.startsWith('delete:'))).toEqual(['delete:c1']);
  });

  // The wipe is scoped to the exported revisions: a comment the server adds
  // while the confirmation is open is NOT in the artifact, so the clear must
  // not take it (0.10.0 review #1 — the add corridor).
  it('a comment added after the export survives the clear', async () => {
    captureBlobs();
    captureClipboard();
    spacedClock();
    let resolveSource!: (c: Comment[]) => void;
    seedStore([makeComment('c1', 'exported one')]);
    const deltas: string[] = [];
    annotator = makeAnnotator({
      activation: { mode: 'stealth' },
      exportUi: 'always',
      source: () => new Promise<Comment[]>((r) => (resolveSource = r)),
      onChange: (_s, d) => deltas.push(`${d.type}:${d.comment.id}`),
    });
    await exportToConfirmation();

    // Hydration lands a NEW server comment while the confirmation is open.
    resolveSource([makeComment('c9', 'added after export')]);
    await new Promise((r) => setTimeout(r, 0));
    expect(loadStore(localStorage, PROJECT, REVIEWER)?.comments).toHaveLength(2);

    byLabel('Clear comments')!.click();
    // Only the exported comment is offered for deletion.
    expect(byLabel('Clear 1 comment?')).toBeDefined();
    byLabel('Clear 1 comment?')!.click();

    const kept = loadStore(localStorage, PROJECT, REVIEWER)?.comments ?? [];
    expect(kept.map((c) => c.id)).toEqual(['c9']);
    expect(deltas.filter((d) => d.startsWith('delete:'))).toEqual(['delete:c1']);
    // The surviving comment keeps its chip and pin.
    expect(chip()).not.toBeNull();
  });

  // The edit corridor of the same P1: a newer revision of an exported id is
  // feedback the artifact does NOT hold, so it survives too — and when nothing
  // of the exported batch remains, the control retires instead of arming a
  // nonsense "Clear 0 comments?".
  it('an exported comment edited to a newer revision survives, and the control retires', async () => {
    captureBlobs();
    captureClipboard();
    let resolveSource!: (c: Comment[]) => void;
    const exported = makeComment('c1', 'old text');
    seedStore([exported]);
    annotator = makeAnnotator({
      activation: { mode: 'stealth' },
      exportUi: 'always',
      source: () => new Promise<Comment[]>((r) => (resolveSource = r)),
    });
    await exportToConfirmation();

    // Server-newer revision of the SAME id merges in (updatedAt moves on).
    resolveSource([{ ...exported, text: 'newer text', updatedAt: '2026-01-02T00:00:00.000Z' }]);
    await new Promise((r) => setTimeout(r, 0));

    byLabel('Clear comments')!.click();
    expect(byLabel('Clear 0 comments?')).toBeUndefined();
    expect(body()).toContain('Nothing left to clear');
    expect(byLabel('Clear comments')).toBeUndefined(); // retired, not armed
    expect(loadStore(localStorage, PROJECT, REVIEWER)?.comments).toHaveLength(1);
  });

  // Disposition is server-owned and merges WITHOUT an updatedAt bump
  // (PROTOCOL): a comment the team resolved since the export carries state the
  // artifact does not hold, so the clear must not destroy it (0.10.0 review #2).
  it('a comment the team resolved since the export survives the clear', async () => {
    captureBlobs();
    captureClipboard();
    let resolveSource!: (c: Comment[]) => void;
    const exported = makeComment('c1', 'resolved later');
    seedStore([exported]);
    annotator = makeAnnotator({
      activation: { mode: 'stealth' },
      exportUi: 'always',
      source: () => new Promise<Comment[]>((r) => (resolveSource = r)),
    });
    await exportToConfirmation();

    // Same id, same updatedAt — only the server-owned STATUS moved. Isolated
    // from the resolution case below so dropping either field from the stamp
    // fails a test (0.10.0 review #3).
    resolveSource([{ ...exported, status: 'done' }]);
    await new Promise((r) => setTimeout(r, 0));

    byLabel('Clear comments')!.click();
    expect(body()).toContain('Nothing left to clear');
    const kept = loadStore(localStorage, PROJECT, REVIEWER)?.comments ?? [];
    expect(kept).toHaveLength(1);
    expect(kept[0]?.status).toBe('done');
  });

  it('a resolution note added since the export survives the clear', async () => {
    captureBlobs();
    captureClipboard();
    let resolveSource!: (c: Comment[]) => void;
    const exported = makeComment('c1', 'noted later');
    seedStore([exported]);
    annotator = makeAnnotator({
      activation: { mode: 'stealth' },
      exportUi: 'always',
      source: () => new Promise<Comment[]>((r) => (resolveSource = r)),
    });
    await exportToConfirmation();

    // Same id, same updatedAt, same (absent) status — only the note moved.
    resolveSource([{ ...exported, resolution: 'needs design input' }]);
    await new Promise((r) => setTimeout(r, 0));

    byLabel('Clear comments')!.click();
    expect(body()).toContain('Nothing left to clear');
    const kept = loadStore(localStorage, PROJECT, REVIEWER)?.comments ?? [];
    expect(kept).toHaveLength(1);
    expect(kept[0]?.resolution).toBe('needs design input');
  });

  // The exporter prints absent status as "Status: open", so a server echo that
  // merely makes the default explicit is the SAME revision — it must not shrink
  // the batch into a false "Nothing left to clear" (0.10.0 review #3).
  it("a server echo making status 'open' explicit is still the exported revision", async () => {
    captureBlobs();
    captureClipboard();
    spacedClock();
    let resolveSource!: (c: Comment[]) => void;
    const exported = makeComment('c1', 'echoed');
    seedStore([exported]);
    annotator = makeAnnotator({
      activation: { mode: 'stealth' },
      exportUi: 'always',
      source: () => new Promise<Comment[]>((r) => (resolveSource = r)),
    });
    await exportToConfirmation();

    resolveSource([{ ...exported, status: 'open' }]);
    await new Promise((r) => setTimeout(r, 0));

    byLabel('Clear comments')!.click();
    expect(byLabel('Clear 1 comment?')).toBeDefined();
    byLabel('Clear 1 comment?')!.click();
    expect(body()).toContain('cleared');
    expect(loadStore(localStorage, PROJECT, REVIEWER)?.comments ?? []).toHaveLength(0);
  });

  // The FIRST tap folds the durable truth too: an edit persisted before it
  // must retire the control, not arm a count from stale memory (0.10.0
  // review #4).
  it('an edit persisted before the first tap retires the control at the arm', async () => {
    captureBlobs();
    captureClipboard();
    const exported = makeComment('c1', 'original');
    seedStore([exported]);
    const deltas: string[] = [];
    annotator = makeAnnotator({
      activation: { mode: 'stealth' },
      onChange: (_s, d) => deltas.push(`${d.type}:${d.comment.id}`),
    });
    await exportToConfirmation();

    saveStore(localStorage, {
      ...emptyStore(PROJECT, REVIEWER),
      comments: [{ ...exported, text: 'edited in tab B', updatedAt: '2026-01-02T00:00:00.000Z' }],
    });
    byLabel('Clear comments')!.click();

    expect(body()).toContain('Nothing left to clear');
    expect(byLabel('Clear comments')).toBeUndefined();
    expect(deltas.filter((d) => d.startsWith('delete:'))).toEqual([]);
    expect(loadStore(localStorage, PROJECT, REVIEWER)?.comments[0]?.text).toBe('edited in tab B');
  });

  // Same reviewer, another tab: a newer revision persisted OUTSIDE this tab's
  // memory must survive a clear computed from that stale memory — the wipe
  // reads the durable truth before destroying (0.10.0 review #3).
  it('a newer revision persisted by another tab survives the clear', async () => {
    captureBlobs();
    captureClipboard();
    spacedClock();
    const exported = makeComment('c1', 'original');
    seedStore([exported]);
    const deltas: string[] = [];
    annotator = makeAnnotator({
      activation: { mode: 'stealth' },
      onChange: (_s, d) => deltas.push(`${d.type}:${d.comment.id}`),
    });
    await exportToConfirmation();

    byLabel('Clear comments')!.click();
    // Tab B persists an edit under the same reviewer while this tab is armed.
    saveStore(localStorage, {
      ...emptyStore(PROJECT, REVIEWER),
      comments: [{ ...exported, text: 'edited in tab B', updatedAt: '2026-01-02T00:00:00.000Z' }],
    });
    byLabel('Clear 1 comment?')!.click();

    expect(body()).toContain('Nothing left to clear');
    expect(deltas.filter((d) => d.startsWith('delete:'))).toEqual([]);
    const kept = loadStore(localStorage, PROJECT, REVIEWER)?.comments ?? [];
    expect(kept).toHaveLength(1);
    expect(kept[0]?.text).toBe('edited in tab B');
  });

  // The nastier schedule: the rename lands INSIDE the wipe, between the
  // pre-fold and the persist (localStorage has no cross-context lock). The
  // wipe must converge — deletes on the wire, nothing resurrected under the
  // new key (0.10.0 review #3).
  it('a rename landing mid-persist cannot resurrect the cleared comment', async () => {
    captureBlobs();
    captureClipboard();
    spacedClock();
    seedStore([makeComment('c1', 'renamed mid-write')]);
    let armTrap = false;
    let fired = false;
    const storage = new Proxy(localStorage, {
      get(t, prop: string) {
        if (prop === 'setItem') {
          return (k: string, v: string) => {
            if (armTrap && !fired) {
              fired = true;
              // Tab B's rename interleaves exactly here, before this write.
              renameReviewer(localStorage, PROJECT, REVIEWER, 'Zed');
            }
            t.setItem(k, v);
          };
        }
        const val = (t as unknown as Record<string, unknown>)[prop];
        return typeof val === 'function' ? (val as (...a: unknown[]) => unknown).bind(t) : val;
      },
    });
    const deltas: string[] = [];
    annotator = makeAnnotator({
      activation: { mode: 'stealth' },
      storage,
      onChange: (_s, d) => deltas.push(`${d.type}:${d.comment.id}`),
    });
    await exportToConfirmation();

    byLabel('Clear comments')!.click();
    armTrap = true;
    byLabel('Clear 1 comment?')!.click();

    expect(fired).toBe(true); // the interleaving actually happened
    expect(body()).toContain('cleared');
    expect(deltas.filter((d) => d.startsWith('delete:'))).toEqual(['delete:c1']);
    const zed = loadStore(localStorage, PROJECT, 'Zed');
    expect(zed).not.toBeNull(); // the destination store exists — emptiness is proven, not vacuous
    expect(zed?.comments ?? []).toHaveLength(0);
    expect(shadow().querySelectorAll('button.pin')).toHaveLength(0);
  });

  // The strip stays REVISION-scoped through every retry: a newer revision of a
  // cleared id folded in mid-wipe survives, and its id gets no delete — the
  // wire must never be told to drop feedback the device knows is newer
  // (0.10.0 review #4).
  it('a newer revision folded in mid-wipe survives, and no delete is emitted for it', async () => {
    captureBlobs();
    captureClipboard();
    spacedClock();
    const exported = makeComment('c1', 'exported revision');
    seedStore([exported]);
    let armTrap = false;
    let fired = false;
    const storage = new Proxy(localStorage, {
      get(t, prop: string) {
        if (prop === 'setItem') {
          return (k: string, v: string) => {
            if (armTrap && !fired) {
              fired = true;
              renameReviewer(localStorage, PROJECT, REVIEWER, 'Zed');
              // Tab B holds a NEWER revision of the exported comment.
              saveStore(localStorage, {
                ...emptyStore(PROJECT, 'Zed'),
                comments: [
                  { ...exported, text: 'edited under Zed', updatedAt: '2026-01-02T00:00:00.000Z' },
                ],
              });
            }
            t.setItem(k, v);
          };
        }
        const val = (t as unknown as Record<string, unknown>)[prop];
        return typeof val === 'function' ? (val as (...a: unknown[]) => unknown).bind(t) : val;
      },
    });
    const deltas: string[] = [];
    annotator = makeAnnotator({
      activation: { mode: 'stealth' },
      storage,
      onChange: (_s, d) => deltas.push(`${d.type}:${d.comment.id}`),
    });
    await exportToConfirmation();

    byLabel('Clear comments')!.click();
    armTrap = true;
    byLabel('Clear 1 comment?')!.click();

    expect(fired).toBe(true);
    expect(deltas.filter((d) => d.startsWith('delete:'))).toEqual([]);
    const kept = loadStore(localStorage, PROJECT, 'Zed')?.comments ?? [];
    expect(kept).toHaveLength(1);
    expect(kept[0]?.text).toBe('edited under Zed');
  });

  // A storage write that fails must fail CLOSED: no success report, no wire
  // deletes, and the control returns to resting for a retry (0.10.0 review #4).
  it('a failed write reports failure instead of success', async () => {
    captureBlobs();
    captureClipboard();
    spacedClock();
    seedStore([makeComment('c1', 'stuck on disk')]);
    let failWrites = false;
    const storage = new Proxy(localStorage, {
      get(t, prop: string) {
        if (prop === 'setItem') {
          return (k: string, v: string) => {
            if (failWrites) throw new Error('QuotaExceededError');
            t.setItem(k, v);
          };
        }
        const val = (t as unknown as Record<string, unknown>)[prop];
        return typeof val === 'function' ? (val as (...a: unknown[]) => unknown).bind(t) : val;
      },
    });
    const deltas: string[] = [];
    annotator = makeAnnotator({
      activation: { mode: 'stealth' },
      storage,
      onChange: (_s, d) => deltas.push(`${d.type}:${d.comment.id}`),
    });
    await exportToConfirmation();

    byLabel('Clear comments')!.click();
    failWrites = true;
    byLabel('Clear 1 comment?')!.click();

    expect(body()).toContain('could not be cleared');
    expect(body()).not.toContain('Comments cleared');
    expect(deltas.filter((d) => d.startsWith('delete:'))).toEqual([]);
    expect(byLabel('Clear comments')).toBeDefined(); // resting again, retryable
    // The screen must keep showing what disk still holds: the verification
    // read folds back into memory, so the pins and chip survive the failed
    // wipe instead of vanishing under a failure message (0.10.0 review #5).
    expect(shadow().querySelectorAll('button.pin')).toHaveLength(1);
    expect(chip()).not.toBeNull();
    failWrites = false;
    expect(loadStore(localStorage, PROJECT, REVIEWER)?.comments).toHaveLength(1);
  });

  // Synced hosts: PROTOCOL deletes are id-keyed with no revision precondition,
  // so a wipe while hydration is still in flight could destroy a backend
  // revision this device has never seen. The wipe waits instead (0.10.0
  // review #4).
  it('the wipe waits for a pending hydration', async () => {
    captureBlobs();
    captureClipboard();
    spacedClock();
    let resolveSource!: (c: Comment[]) => void;
    seedStore([makeComment('c1', 'awaiting sync')]);
    const deltas: string[] = [];
    annotator = makeAnnotator({
      activation: { mode: 'stealth' },
      exportUi: 'always',
      source: () => new Promise<Comment[]>((r) => (resolveSource = r)),
      onChange: (_s, d) => deltas.push(`${d.type}:${d.comment.id}`),
    });
    await exportToConfirmation();

    byLabel('Clear comments')!.click();
    byLabel('Clear 1 comment?')!.click(); // hydration still pending
    expect(body()).toContain('Still syncing');
    expect(byLabel('Clear 1 comment?')).toBeDefined(); // still armed
    expect(loadStore(localStorage, PROJECT, REVIEWER)?.comments).toHaveLength(1);

    resolveSource([]);
    await new Promise((r) => setTimeout(r, 0));
    byLabel('Clear 1 comment?')!.click();
    expect(body()).toContain('cleared');
    expect(deltas.filter((d) => d.startsWith('delete:'))).toEqual(['delete:c1']);
  });

  // A hydration that FAILED is not a pass: the device has never seen server
  // truth, so an id-keyed delete could destroy an unseen backend revision.
  // The wipe refuses outright instead of treating "not in flight" as "in
  // sync" (0.10.0 review #5).
  it('a failed hydration blocks the synced clear', async () => {
    captureBlobs();
    captureClipboard();
    spacedClock();
    let rejectSource!: (e: Error) => void;
    seedStore([makeComment('c1', 'never synced')]);
    const deltas: string[] = [];
    annotator = makeAnnotator({
      activation: { mode: 'stealth' },
      exportUi: 'always',
      source: () => new Promise<Comment[]>((_r, rej) => (rejectSource = rej)),
      onChange: (_s, d) => deltas.push(`${d.type}:${d.comment.id}`),
    });
    rejectSource(new Error('backend down'));
    await new Promise((r) => setTimeout(r, 0));
    await exportToConfirmation();

    byLabel('Clear comments')!.click();
    byLabel('Clear 1 comment?')!.click();
    expect(body()).toContain('Could not sync');
    expect(deltas.filter((d) => d.startsWith('delete:'))).toEqual([]);
    expect(loadStore(localStorage, PROJECT, REVIEWER)?.comments).toHaveLength(1);
  });

  it('a synchronously-throwing source blocks the synced clear the same way', async () => {
    captureBlobs();
    captureClipboard();
    spacedClock();
    seedStore([makeComment('c1', 'never synced')]);
    annotator = makeAnnotator({
      activation: { mode: 'stealth' },
      exportUi: 'always',
      source: (() => {
        throw new Error('boom');
      }) as unknown as () => Promise<Comment[]>,
    });
    await exportToConfirmation();
    byLabel('Clear comments')!.click();
    byLabel('Clear 1 comment?')!.click();
    expect(body()).toContain('Could not sync');
    expect(loadStore(localStorage, PROJECT, REVIEWER)?.comments).toHaveLength(1);
  });

  // Fulfilled is not accepted: a source() that resolves with garbage (or an
  // array whose entries the normalizer drops) has still never shown this
  // device server truth (0.10.0 review #6).
  it('a malformed fulfilled source response blocks the synced clear', async () => {
    captureBlobs();
    captureClipboard();
    spacedClock();
    let resolveSource!: (v: unknown) => void;
    seedStore([makeComment('c1', 'unseen server twin')]);
    annotator = makeAnnotator({
      activation: { mode: 'stealth' },
      exportUi: 'always',
      source: () => new Promise<Comment[]>((r) => (resolveSource = r as (v: unknown) => void)),
    });
    resolveSource({ error: 'offline' });
    await new Promise((r) => setTimeout(r, 0));
    await exportToConfirmation();
    byLabel('Clear comments')!.click();
    byLabel('Clear 1 comment?')!.click();
    expect(body()).toContain('Could not sync');
    expect(loadStore(localStorage, PROJECT, REVIEWER)?.comments).toHaveLength(1);
  });

  it('an array response with a dropped entry blocks the synced clear too', async () => {
    captureBlobs();
    captureClipboard();
    spacedClock();
    let resolveSource!: (v: unknown) => void;
    seedStore([makeComment('c1', 'unseen server twin')]);
    annotator = makeAnnotator({
      activation: { mode: 'stealth' },
      exportUi: 'always',
      source: () => new Promise<Comment[]>((r) => (resolveSource = r as (v: unknown) => void)),
    });
    // The server DID send c1 — but mangled, so the normalizer drops it and the
    // device stays blind to the revision it carried.
    resolveSource([{ id: 'c1', mangled: true }]);
    await new Promise((r) => setTimeout(r, 0));
    await exportToConfirmation();
    byLabel('Clear comments')!.click();
    byLabel('Clear 1 comment?')!.click();
    expect(body()).toContain('Could not sync');
    expect(loadStore(localStorage, PROJECT, REVIEWER)?.comments).toHaveLength(1);
  });

  // A refused fold with an OCCUPIED destination: the newer revision under the
  // remembered key must join the fold read-only, or the clear deletes what the
  // fold could not move (0.10.0 review #6).
  it('a refused fold with an occupied destination protects its newer revision', async () => {
    captureBlobs();
    captureClipboard();
    spacedClock();
    const exported = makeComment('c1', 'old under Tester');
    seedStore([exported]);
    saveStore(localStorage, {
      ...emptyStore(PROJECT, 'Zed'),
      comments: [{ ...exported, text: 'newer under Zed', updatedAt: '2026-01-02T00:00:00.000Z' }],
    });
    const storage = new Proxy(localStorage, {
      get(t, prop: string) {
        if (prop === 'setItem') {
          return (k: string, v: string) => {
            if (k.includes('Zed')) throw new Error('QuotaExceededError');
            t.setItem(k, v);
          };
        }
        const val = (t as unknown as Record<string, unknown>)[prop];
        return typeof val === 'function' ? (val as (...a: unknown[]) => unknown).bind(t) : val;
      },
    });
    const deltas: string[] = [];
    annotator = makeAnnotator({
      activation: { mode: 'stealth' },
      storage,
      onChange: (_s, d) => deltas.push(`${d.type}:${d.comment.id}`),
    });
    await exportToConfirmation();

    byLabel('Clear comments')!.click();
    localStorage.setItem(`pinflow:r:${PROJECT}`, 'Zed');
    byLabel('Clear 1 comment?')!.click();

    expect(body()).toContain('Nothing left to clear');
    expect(deltas.filter((d) => d.startsWith('delete:'))).toEqual([]);
    expect(loadStore(localStorage, PROJECT, 'Zed')?.comments[0]?.text).toBe('newer under Zed');
  });

  // The held-then-missing race: another tab completes the fold between this
  // tab's pre-read and the rename's own read. A false there means MOVED, not
  // refused — re-classify and adopt (0.10.0 review #6).
  it('a fold completed under our feet is adopted, not misread as refusal', async () => {
    captureBlobs();
    captureClipboard();
    spacedClock();
    seedStore([makeComment('c1', 'moved mid-read')]);
    let armTrap = false;
    let fired = false;
    const storage = new Proxy(localStorage, {
      get(t, prop: string) {
        if (prop === 'getItem') {
          return (k: string) => {
            const v = t.getItem(k);
            if (armTrap && !fired && k.includes(encodeURIComponent(REVIEWER))) {
              fired = true;
              // The other tab folds Tester -> Zed between our two reads.
              renameReviewer(localStorage, PROJECT, REVIEWER, 'Zed');
            }
            return v;
          };
        }
        const val = (t as unknown as Record<string, unknown>)[prop];
        return typeof val === 'function' ? (val as (...a: unknown[]) => unknown).bind(t) : val;
      },
    });
    const deltas: string[] = [];
    annotator = makeAnnotator({
      activation: { mode: 'stealth' },
      storage,
      onChange: (_s, d) => deltas.push(`${d.type}:${d.comment.id}`),
    });
    await exportToConfirmation();

    byLabel('Clear comments')!.click();
    // The remembered marker moves FIRST, so the confirming fold enters the
    // rename path and the trap interleaves between the held pre-read and the
    // rename's own read — the exact repaired branch (0.10.0 review #7).
    localStorage.setItem(`pinflow:r:${PROJECT}`, 'Zed');
    armTrap = true;
    byLabel('Clear 1 comment?')!.click();

    expect(fired).toBe(true);
    expect(body()).toContain('cleared');
    expect(deltas.filter((d) => d.startsWith('delete:'))).toEqual(['delete:c1']);
    expect(loadStore(localStorage, PROJECT, 'Zed')?.comments ?? []).toHaveLength(0);
  });

  // A refused identity fold must not escape verification: when the rename
  // copy fails, the corpus is still under the OLD key, and switching identity
  // anyway would verify an empty destination while the durable copy survives
  // behind an emitted delete (0.10.0 review #5).
  it('a failed rename fold keeps the clear honest under the old key', async () => {
    captureBlobs();
    captureClipboard();
    spacedClock();
    seedStore([makeComment('c1', 'renamed nowhere')]);
    const storage = new Proxy(localStorage, {
      get(t, prop: string) {
        if (prop === 'setItem') {
          return (k: string, v: string) => {
            if (k.includes('Zed')) throw new Error('QuotaExceededError');
            t.setItem(k, v);
          };
        }
        const val = (t as unknown as Record<string, unknown>)[prop];
        return typeof val === 'function' ? (val as (...a: unknown[]) => unknown).bind(t) : val;
      },
    });
    const deltas: string[] = [];
    annotator = makeAnnotator({
      activation: { mode: 'stealth' },
      storage,
      onChange: (_s, d) => deltas.push(`${d.type}:${d.comment.id}`),
    });
    await exportToConfirmation();

    byLabel('Clear comments')!.click();
    // Another tab remembers a new name whose key cannot be written.
    localStorage.setItem(`pinflow:r:${PROJECT}`, 'Zed');
    byLabel('Clear 1 comment?')!.click();

    expect(body()).toContain('cleared');
    expect(deltas.filter((d) => d.startsWith('delete:'))).toEqual(['delete:c1']);
    // The wipe landed under the key that actually held the corpus.
    expect(loadStore(localStorage, PROJECT, REVIEWER)?.comments ?? []).toHaveLength(0);
    expect(loadStore(localStorage, PROJECT, 'Zed')).toBeNull();
  });

  // Degenerate timestamps must not alias two different comments into one
  // clearable revision: the stamp anchors on the text the artifact actually
  // quoted (0.10.0 review #5).
  it('a changed comment with a degenerate timestamp still survives the clear', async () => {
    captureBlobs();
    captureClipboard();
    let resolveSource!: (c: Comment[]) => void;
    const exported = { ...makeComment('c1', 'version one'), updatedAt: '' };
    seedStore([exported]);
    annotator = makeAnnotator({
      activation: { mode: 'stealth' },
      exportUi: 'always',
      source: () => new Promise<Comment[]>((r) => (resolveSource = r)),
    });
    await exportToConfirmation();

    // Same id, same (degenerate) updatedAt — different text.
    resolveSource([{ ...exported, text: 'version two' }]);
    await new Promise((r) => setTimeout(r, 0));

    byLabel('Clear comments')!.click();
    expect(body()).toContain('Nothing left to clear');
    expect(loadStore(localStorage, PROJECT, REVIEWER)?.comments[0]?.text).toBe('version two');
  });

  // A route moved on a timestamp tie is content the artifact did not show:
  // the stamp carries route and createdAt too (0.10.0 review #6).
  it('a comment whose route moved on a timestamp tie survives the clear', async () => {
    captureBlobs();
    captureClipboard();
    let resolveSource!: (c: Comment[]) => void;
    const exported = { ...makeComment('c1', 'same words'), updatedAt: '' };
    seedStore([exported]);
    annotator = makeAnnotator({
      activation: { mode: 'stealth' },
      exportUi: 'always',
      source: () => new Promise<Comment[]>((r) => (resolveSource = r)),
    });
    await exportToConfirmation();
    resolveSource([{ ...exported, route: '/moved' }]);
    await new Promise((r) => setTimeout(r, 0));
    byLabel('Clear comments')!.click();
    expect(body()).toContain('Nothing left to clear');
    expect(loadStore(localStorage, PROJECT, REVIEWER)?.comments[0]?.route).toBe('/moved');
  });

  // Equal-timestamp, different-revision copies in memory and on disk are a
  // CONFLICT, not a tie to resolve silently — the clear must not pick a side
  // and then delete it (0.10.0 review #6).
  it('a tie-timestamp divergence between memory and disk is never cleared', async () => {
    captureBlobs();
    captureClipboard();
    spacedClock();
    const exported = { ...makeComment('c1', 'text A'), updatedAt: '' };
    seedStore([exported]);
    let resolveSource!: (c: Comment[]) => void;
    let failNext = false;
    const storage = new Proxy(localStorage, {
      get(t, prop: string) {
        if (prop === 'setItem') {
          return (k: string, v: string) => {
            if (failNext) {
              failNext = false;
              throw new Error('QuotaExceededError');
            }
            t.setItem(k, v);
          };
        }
        const val = (t as unknown as Record<string, unknown>)[prop];
        return typeof val === 'function' ? (val as (...a: unknown[]) => unknown).bind(t) : val;
      },
    });
    const deltas: string[] = [];
    annotator = makeAnnotator({
      activation: { mode: 'stealth' },
      exportUi: 'always',
      storage,
      source: () => new Promise<Comment[]>((r) => (resolveSource = r)),
      onChange: (_s, d) => deltas.push(`${d.type}:${d.comment.id}`),
    });
    await exportToConfirmation();

    // Hydration lands text B on the same timestamp, and its persist fails —
    // memory holds B while disk still holds A.
    failNext = true;
    resolveSource([{ ...exported, text: 'text B' }]);
    await new Promise((r) => setTimeout(r, 0));

    // The conflict is visible at the FIRST tap already: the arm-side fold
    // computes it and retires the control instead of arming.
    byLabel('Clear comments')!.click();
    expect(body()).toContain('Nothing left to clear');
    expect(byLabel('Clear comments')).toBeUndefined();
    expect(deltas.filter((d) => d.startsWith('delete:'))).toEqual([]);
    expect(loadStore(localStorage, PROJECT, REVIEWER)?.comments).toHaveLength(1);
  });

  // Conflict evidence is BATCH state, not fold state: the first tap's fold
  // union overwrites the memory side, so a recomputation at the confirming
  // tap can no longer see the divergence it just protected (0.10.0 review #7).
  it('a conflict discovered at the arm still shields its comment at the confirm', async () => {
    captureBlobs();
    captureClipboard();
    spacedClock();
    const c1 = { ...makeComment('c1', 'text A'), updatedAt: '' };
    const c2 = makeComment('c2', 'plain');
    seedStore([c1, c2]);
    let resolveSource!: (c: Comment[]) => void;
    let failNext = false;
    const storage = new Proxy(localStorage, {
      get(t, prop: string) {
        if (prop === 'setItem') {
          return (k: string, v: string) => {
            if (failNext) {
              failNext = false;
              throw new Error('QuotaExceededError');
            }
            t.setItem(k, v);
          };
        }
        const val = (t as unknown as Record<string, unknown>)[prop];
        return typeof val === 'function' ? (val as (...a: unknown[]) => unknown).bind(t) : val;
      },
    });
    const deltas: string[] = [];
    annotator = makeAnnotator({
      activation: { mode: 'stealth' },
      exportUi: 'always',
      storage,
      source: () => new Promise<Comment[]>((r) => (resolveSource = r)),
      onChange: (_s, d) => deltas.push(`${d.type}:${d.comment.id}`),
    });
    await exportToConfirmation();

    failNext = true;
    resolveSource([{ ...c1, text: 'text B' }]); // tie on c1; persist fails
    await new Promise((r) => setTimeout(r, 0));

    byLabel('Clear comments')!.click();
    expect(byLabel('Clear 1 comment?')).toBeDefined(); // c2 only — c1 is conflicted
    byLabel('Clear 1 comment?')!.click();

    expect(body()).toContain('cleared');
    expect(deltas.filter((d) => d.startsWith('delete:'))).toEqual(['delete:c2']);
    const kept = loadStore(localStorage, PROJECT, REVIEWER)?.comments ?? [];
    expect(kept.map((c) => c.id)).toEqual(['c1']);
  });

  // The identity-adoption union must not pick a tie winner over an undetected
  // conflict: a B held only in memory, with its A moved to the remembered key
  // by another tab, is still a conflict (0.10.0 review #7).
  it('an adoption-union tie preserves the conflict instead of clearing it', async () => {
    captureBlobs();
    captureClipboard();
    spacedClock();
    const c1 = { ...makeComment('c1', 'text A'), updatedAt: '' };
    seedStore([c1]);
    let resolveSource!: (c: Comment[]) => void;
    let failNext = false;
    const storage = new Proxy(localStorage, {
      get(t, prop: string) {
        if (prop === 'setItem') {
          return (k: string, v: string) => {
            if (failNext) {
              failNext = false;
              throw new Error('QuotaExceededError');
            }
            t.setItem(k, v);
          };
        }
        const val = (t as unknown as Record<string, unknown>)[prop];
        return typeof val === 'function' ? (val as (...a: unknown[]) => unknown).bind(t) : val;
      },
    });
    const deltas: string[] = [];
    annotator = makeAnnotator({
      activation: { mode: 'stealth' },
      exportUi: 'always',
      storage,
      source: () => new Promise<Comment[]>((r) => (resolveSource = r)),
      onChange: (_s, d) => deltas.push(`${d.type}:${d.comment.id}`),
    });
    await exportToConfirmation();

    failNext = true;
    resolveSource([{ ...c1, text: 'text B' }]); // memory B, disk A
    await new Promise((r) => setTimeout(r, 0));
    // Another tab folds the disk copy to a remembered new name.
    renameReviewer(localStorage, PROJECT, REVIEWER, 'Zed');

    byLabel('Clear comments')!.click();
    expect(body()).toContain('Nothing left to clear');
    expect(deltas.filter((d) => d.startsWith('delete:'))).toEqual([]);
    expect(loadStore(localStorage, PROJECT, 'Zed')?.comments).toHaveLength(1);
  });

  // A cancelled gesture must not strand an abandoned armed question after
  // focus already left (0.10.0 review #7).
  it('a pointercancel after a deferred focus departure disarms', async () => {
    captureBlobs();
    captureClipboard();
    seedStore([makeComment('c1', 'a')]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    await exportToConfirmation();

    byLabel('Clear comments')!.click();
    await new Promise((r) => setTimeout(r, 0));
    const opts = { bubbles: true, composed: true };
    document.body.dispatchEvent(new Event('pointerdown', opts));
    const leaving = new FocusEvent('focusout', { bubbles: true, composed: true });
    Object.defineProperty(leaving, 'relatedTarget', { value: document.body });
    byLabel('Clear 1 comment?')!.dispatchEvent(leaving);
    expect(byLabel('Clear 1 comment?')).toBeDefined(); // deferred mid-gesture
    document.body.dispatchEvent(new Event('pointercancel', opts));
    expect(byLabel('Clear comments')).toBeDefined(); // the departure lands
    expect(loadStore(localStorage, PROJECT, REVIEWER)?.comments).toHaveLength(1);
  });

  // The pointer swallow and the focusout disarm must COMPOSE: a click on a
  // focusable host control fires focusout between pointerdown and pointerup,
  // and tearing the pointer listener down mid-gesture would skip the swallow
  // (0.10.0 review #6).
  it('a focusable host click still swallows: focusout defers to the pointer gesture', async () => {
    captureBlobs();
    captureClipboard();
    seedStore([makeComment('c1', 'a')]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    await exportToConfirmation();

    byLabel('Clear comments')!.click();
    await new Promise((r) => setTimeout(r, 0)); // outside listeners arm

    // Attached AFTER the arm: the arm tap itself bubbles out of the shadow
    // root and would otherwise pollute the count.
    let hostClicks = 0;
    const host = () => hostClicks++;
    document.body.addEventListener('click', host);

    const opts = { bubbles: true, composed: true };
    document.body.dispatchEvent(new Event('pointerdown', opts));
    // Native focus transfer fires focusout BETWEEN down and up on focusable
    // targets — the disarm must wait for the gesture to finish.
    const leaving = new FocusEvent('focusout', { bubbles: true, composed: true });
    Object.defineProperty(leaving, 'relatedTarget', { value: document.body });
    byLabel('Clear 1 comment?')!.dispatchEvent(leaving);
    expect(byLabel('Clear 1 comment?')).toBeDefined(); // still armed mid-gesture
    document.body.dispatchEvent(new Event('pointerup', opts));

    expect(byLabel('Clear comments')).toBeDefined(); // disarmed by the gesture
    document.body.dispatchEvent(new Event('click', opts));
    expect(hostClicks).toBe(0); // the back-out tap was swallowed, consistently
    document.body.removeEventListener('click', host);
    expect(loadStore(localStorage, PROJECT, REVIEWER)?.comments).toHaveLength(1);
  });

  // Keyboard parity for the outside disarm: Tabbing out of the panel is
  // leaving the question too (0.10.0 review #5).
  it('focus leaving the panel disarms; focus moving within it does not', async () => {
    captureBlobs();
    captureClipboard();
    seedStore([makeComment('c1', 'a')]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    await exportToConfirmation();

    const clr = byLabel('Clear comments')!;
    clr.click();
    expect(byLabel('Clear 1 comment?')).toBeDefined();

    // Within-panel focus movement keeps the question armed.
    const within = new FocusEvent('focusout', { bubbles: true, composed: true });
    Object.defineProperty(within, 'relatedTarget', { value: byLabel('Done')! });
    byLabel('Clear 1 comment?')!.dispatchEvent(within);
    expect(byLabel('Clear 1 comment?')).toBeDefined();

    // Leaving for the host page disarms.
    const leaving = new FocusEvent('focusout', { bubbles: true, composed: true });
    Object.defineProperty(leaving, 'relatedTarget', { value: document.body });
    byLabel('Clear 1 comment?')!.dispatchEvent(leaving);
    expect(byLabel('Clear comments')).toBeDefined();
    expect(byLabel('Clear 1 comment?')).toBeUndefined();
    expect(loadStore(localStorage, PROJECT, REVIEWER)?.comments).toHaveLength(1);
  });

  // Arming is a question; leaving the panel is walking away from it. A tap on
  // the HOST PAGE disarms too, or a stray tap minutes later could still wipe
  // (0.10.0 review #4).
  it('a tap on the host page disarms the armed control', async () => {
    captureBlobs();
    captureClipboard();
    seedStore([makeComment('c1', 'a')]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    await exportToConfirmation();

    byLabel('Clear comments')!.click();
    expect(byLabel('Clear 1 comment?')).toBeDefined();
    // The outside listeners arm on a 0-timeout so the arming tap's own release
    // cannot disarm; a human tap always lands in a later task.
    await new Promise((r) => setTimeout(r, 0));
    pointerTap(document.body);
    expect(byLabel('Clear comments')).toBeDefined();
    expect(byLabel('Clear 1 comment?')).toBeUndefined();
    expect(loadStore(localStorage, PROJECT, REVIEWER)?.comments).toHaveLength(1);
  });

  // The confirming tap re-checks vacuity: a batch that emptied between the
  // taps must not report success over a wipe that removed nothing (0.10.0 review #2).
  it('a batch that empties between arm and confirm reports nothing to clear', async () => {
    captureBlobs();
    captureClipboard();
    spacedClock();
    let resolveSource!: (c: Comment[]) => void;
    const exported = makeComment('c1', 'old text');
    seedStore([exported]);
    annotator = makeAnnotator({
      activation: { mode: 'stealth' },
      exportUi: 'always',
      source: () => new Promise<Comment[]>((r) => (resolveSource = r)),
    });
    await exportToConfirmation();

    byLabel('Clear comments')!.click();
    expect(byLabel('Clear 1 comment?')).toBeDefined();
    // The exported revision is replaced while the control is armed.
    resolveSource([{ ...exported, text: 'newer', updatedAt: '2026-01-02T00:00:00.000Z' }]);
    await new Promise((r) => setTimeout(r, 0));

    byLabel('Clear 1 comment?')!.click();
    expect(body()).toContain('Nothing left to clear');
    expect(body()).not.toContain('Comments cleared');
    expect(loadStore(localStorage, PROJECT, REVIEWER)?.comments).toHaveLength(1);
    expect(shadow().querySelectorAll('button.pin').length).toBeGreaterThan(0);
  });

  // A cross-tab rename between export and clear: identity must reconcile
  // BEFORE the wipe computes, or _persist unions the on-disk corpus back into
  // the emptied store while deletes go out on the wire (0.10.0 review #2).
  it('a clear that races a cross-tab rename still lands: no resurrection', async () => {
    captureBlobs();
    captureClipboard();
    spacedClock();
    seedStore([makeComment('c1', 'renamed away')]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    await exportToConfirmation();

    byLabel('Clear comments')!.click();
    // Another tab renames the reviewer while the control is armed.
    expect(renameReviewer(localStorage, PROJECT, REVIEWER, 'Zed')).toBe(true);
    byLabel('Clear 1 comment?')!.click();

    expect(body()).toContain('cleared');
    expect(loadStore(localStorage, PROJECT, 'Zed')?.comments ?? []).toHaveLength(0);
    expect(shadow().querySelectorAll('button.pin')).toHaveLength(0);
  });

  // The safety property the whole redesign rests on: clearing must not remove
  // the recovery that makes clearing safe. Both retries stay live and re-send
  // the HELD artifact — never a rebuild from the wiped store.
  it('clearing keeps the confirmation open with both retry channels live', async () => {
    const blobs = captureBlobs();
    const writes = captureClipboard();
    spacedClock();
    seedStore([makeComment('c1', 'still recoverable')]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    await exportToConfirmation();

    byLabel('Clear comments')!.click();
    byLabel('Clear 1 comment?')!.click();

    expect(shadow().querySelector('.panel')).not.toBeNull();
    expect(chip()).toBeNull(); // the corpus really is gone

    // Download retry: the blob handed to createObjectURL after the wipe must
    // carry the held artifact, not an empty rebuild (0.10.0 review #1).
    byLabel('Download Feedback Markdown')!.click();
    // A spent control must stay spent: this click used to trip the disarm
    // branch and overwrite the cleared report with the resting body (0.10.0 review #2).
    expect(body()).toContain('cleared');
    expect(blobs).toHaveLength(2);
    await expect(blobs[1]!.text()).resolves.toContain('still recoverable');

    byLabel('Copy to Clipboard')!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(writes).toHaveLength(2);
    expect(writes[1]).toContain('still recoverable');
  });

  it('the confirming activation moves focus to Done, not to the void', async () => {
    captureBlobs();
    captureClipboard();
    spacedClock();
    seedStore([makeComment('c1', 'a')]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    await exportToConfirmation();

    byLabel('Clear comments')!.click();
    byLabel('Clear 1 comment?')!.click();
    // The focused element was just removed; a keyboard user must land on a
    // surviving control inside the still-open panel (0.10.0 review #1).
    expect(shadow().activeElement).toBe(byLabel('Done'));
  });

  // Recovery is an exception path; finishing is the common one. The download
  // already fired on the way here, so re-firing it is not the primary action.
  it('gives primary emphasis to Done, not to a retry that already ran', async () => {
    captureBlobs();
    captureClipboard();
    seedStore([makeComment('c1', 'a')]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    await exportToConfirmation();
    expect(byLabel('Done')?.className).toContain('primary');
    expect(byLabel('Download Feedback Markdown')?.className).not.toContain('primary');
  });

  it('announces body changes: the panel paragraph is a polite live region', async () => {
    captureBlobs();
    captureClipboard();
    seedStore([makeComment('c1', 'a')]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    await exportToConfirmation();
    expect(shadow().querySelector('.panel p')?.getAttribute('aria-live')).toBe('polite');
  });

  // Latest retry wins: an older failed write must not shout over a newer
  // success (0.10.0 review #2 — request generation reserved at retry START).
  it('concurrent copy retries resolve latest-wins', async () => {
    captureBlobs();
    const pend: Array<(ok: boolean) => void> = [];
    vi.stubGlobal(
      'navigator',
      Object.create(navigator, {
        clipboard: {
          value: {
            writeText: () =>
              new Promise<void>((res, rej) =>
                pend.push((ok) => (ok ? res() : rej(new Error('x')))),
              ),
          },
          configurable: true,
        },
      }),
    );
    seedStore([makeComment('c1', 'a')]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    chip()!.click();
    byLabel('Export & share')!.click();
    pend[0]!(true); // the export's own copy
    await new Promise((r) => setTimeout(r, 0));

    byLabel('Copy to Clipboard')!.click(); // retry A
    byLabel('Copy to Clipboard')!.click(); // retry B
    pend[1]!(false); // A fails first…
    await new Promise((r) => setTimeout(r, 0));
    pend[2]!(true); // …B succeeds after
    await new Promise((r) => setTimeout(r, 0));
    expect(body()).toBe('Copied to your clipboard.');
  });

  it('concurrent copy retries resolve latest-wins in the inverse order too', async () => {
    captureBlobs();
    const pend: Array<(ok: boolean) => void> = [];
    vi.stubGlobal(
      'navigator',
      Object.create(navigator, {
        clipboard: {
          value: {
            writeText: () =>
              new Promise<void>((res, rej) =>
                pend.push((ok) => (ok ? res() : rej(new Error('x')))),
              ),
          },
          configurable: true,
        },
      }),
    );
    seedStore([makeComment('c1', 'a')]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    chip()!.click();
    byLabel('Export & share')!.click();
    pend[0]!(true);
    await new Promise((r) => setTimeout(r, 0));

    byLabel('Copy to Clipboard')!.click(); // retry A
    byLabel('Copy to Clipboard')!.click(); // retry B
    pend[2]!(true); // B (newest) succeeds FIRST…
    await new Promise((r) => setTimeout(r, 0));
    pend[1]!(false); // …then stale A fails late
    await new Promise((r) => setTimeout(r, 0));
    // A completion-order implementation would let A's late failure overwrite
    // the success; reservation order must win (0.10.0 review #3).
    expect(body()).toBe('Copied to your clipboard.');
  });

  // Delivery is mutable state: a successful retry upgrades what the armed
  // warning may honestly claim (0.10.0 review #2).
  it('a successful copy retry upgrades the armed warning', async () => {
    captureBlobs();
    vi.stubGlobal(
      'navigator',
      Object.create(navigator, { clipboard: { value: undefined, configurable: true } }),
    );
    seedStore([makeComment('c1', 'a')]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    await exportToConfirmation(); // copied=false — no clipboard at all
    expect(body()).toContain('downloads');

    captureClipboard(); // clipboard becomes available (e.g. permission granted)
    byLabel('Copy to Clipboard')!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(body()).toBe('Copied to your clipboard.');

    byLabel('Clear comments')!.click();
    expect(body()).toContain('The exported file is unaffected');
    expect(body()).not.toContain('there is no other copy');
  });

  it('disarming restores the delivered resting line, not the export-time one', async () => {
    captureBlobs();
    vi.stubGlobal(
      'navigator',
      Object.create(navigator, { clipboard: { value: undefined, configurable: true } }),
    );
    seedStore([makeComment('c1', 'a')]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    await exportToConfirmation(); // copied=false
    expect(body()).toContain('downloads');

    captureClipboard();
    byLabel('Copy to Clipboard')!.click();
    await new Promise((r) => setTimeout(r, 0));

    byLabel('Clear comments')!.click(); // armed warning (delivered form)
    byLabel('Download Feedback Markdown')!.click(); // disarm via another action
    // The resting line must reflect VERIFIED delivery, not the export-time
    // failure (0.10.0 review #4).
    expect(body()).toContain('Copied to your clipboard');
    expect(body()).not.toBe('Check your downloads for the file.');
  });

  // The armed control guards key-repeat on Enter alone — held Enter activates
  // per keydown, but arrow-key scrolling must keep working (0.10.0 review #2).
  it('the repeat guard swallows held Enter and nothing else', async () => {
    captureBlobs();
    captureClipboard();
    seedStore([makeComment('c1', 'a')]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    await exportToConfirmation();
    const clr = byLabel('Clear comments')!;
    clr.click(); // armed

    const repeatEnter = new KeyboardEvent('keydown', {
      key: 'Enter',
      repeat: true,
      cancelable: true,
      bubbles: true,
    });
    clr.dispatchEvent(repeatEnter);
    expect(repeatEnter.defaultPrevented).toBe(true);

    const firstEnter = new KeyboardEvent('keydown', {
      key: 'Enter',
      cancelable: true,
      bubbles: true,
    });
    clr.dispatchEvent(firstEnter);
    expect(firstEnter.defaultPrevented).toBe(false);

    const repeatArrow = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      repeat: true,
      cancelable: true,
      bubbles: true,
    });
    clr.dispatchEvent(repeatArrow);
    expect(repeatArrow.defaultPrevented).toBe(false);
  });

  it('the sheet offers Send to builder when onSubmit is configured; clicking it calls the handler', async () => {
    seedStore([makeComment('c1', 'x')]);
    const onSubmit = vi.fn();
    annotator = makeAnnotator({ activation: { mode: 'stealth' }, onSubmit });
    chip()!.click();
    byLabel('Send to builder')!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(onSubmit).toHaveBeenCalled();
  });

  it('no Send to builder row without onSubmit', () => {
    seedStore([makeComment('c1', 'x')]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    chip()!.click();
    expect(byLabel('Send to builder')).toBeUndefined();
  });
});

describe('sheet surfaces unanchored comments (0.3.0 orphan tray-row)', () => {
  let annotator: Annotator | null = null;

  afterEach(() => {
    annotator?.destroy();
    annotator = null;
    localStorage.clear();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('title appends the unanchored count when a pin has no element', () => {
    const good = makeComment('c1', 'anchored fine');
    const bad = makeComment('c2', 'orphaned one');
    bad.anchor = {
      ...bad.anchor,
      selectors: { testid: null, id: null, css: '#gone', xpath: '/html/body/div[99]' },
      textFingerprint: 'text that exists nowhere on this page at all',
    };
    seedStore([good, bad]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    chip()!.click();
    expect(shadow().querySelector('.panel h3')?.textContent).toBe(
      '2 comments · 1 screen · 1 unanchored',
    );
  });
});

describe('orphan state stays live through reposition (0.3.0 review #9)', () => {
  let annotator: Annotator | null = null;

  afterEach(() => {
    annotator?.destroy();
    annotator = null;
    localStorage.clear();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('a target that disappears AFTER mount re-orphans the pin, and the sheet reports it', () => {
    const t = document.createElement('div');
    t.id = 'goes-away';
    t.textContent = 'temporary content nobody else has';
    document.body.appendChild(t);
    const c = makeComment('c1', 'note');
    c.anchor = {
      ...c.anchor,
      selectors: { testid: null, id: 'goes-away', css: '#goes-away', xpath: '/html/body/div[1]' },
      textFingerprint: 'temporary content nobody else has',
    };
    seedStore([c]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    const pin = shadow().querySelector<HTMLElement>('.pin')!;
    expect(pin.dataset['orphaned']).toBeUndefined();

    t.remove();
    vi.spyOn(performance, 'now').mockReturnValue(10_000);
    (annotator as unknown as { _repositionPins(): void })._repositionPins();
    expect(pin.dataset['orphaned']).toBe('true');
    expect(pin.style.display).toBe('none');

    chip()!.click();
    expect(shadow().querySelector('.panel h3')?.textContent).toContain('1 unanchored');
  });

  it('an OPEN sheet’s title refreshes when a pin re-orphans', () => {
    const t = document.createElement('div');
    t.id = 'g2';
    t.textContent = 'more temporary content for the sheet';
    document.body.appendChild(t);
    const c = makeComment('c1', 'note');
    c.anchor = {
      ...c.anchor,
      selectors: { testid: null, id: 'g2', css: '#g2', xpath: '/html/body/div[1]' },
      textFingerprint: 'more temporary content for the sheet',
    };
    seedStore([c]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    chip()!.click();
    expect(shadow().querySelector('.panel h3')?.textContent).not.toContain('unanchored');
    t.remove();
    vi.spyOn(performance, 'now').mockReturnValue(10_000);
    (annotator as unknown as { _repositionPins(): void })._repositionPins();
    expect(shadow().querySelector('.panel h3')?.textContent).toContain('1 unanchored');
  });
});

describe('hydration races (0.3.0 review P1 + heal overlay)', () => {
  let annotator: Annotator | null = null;

  afterEach(() => {
    annotator?.destroy();
    annotator = null;
    localStorage.clear();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('Clear all during pending hydration: the late snapshot cannot resurrect deleted comments', async () => {
    seedStore([makeComment('c1', 'kill me')]);
    let resolveSource!: (v: Comment[]) => void;
    const deltas: string[] = [];
    annotator = makeAnnotator({
      exportUi: 'always',
      source: () => new Promise<Comment[]>((r) => (resolveSource = r)),
      onChange: (_s, d) => deltas.push(`${d.type}:${d.comment.id}`),
    });
    // Delete through the pin popup (the panel's Clear all is gone in 0.5.0).
    shadow().querySelector<HTMLDivElement>('.pin')!.click();
    shadow().querySelector<HTMLButtonElement>('button.delete')!.click();
    expect(deltas).toEqual(['delete:c1']);

    // The server snapshot was taken BEFORE the delete — it still has c1.
    resolveSource([makeComment('c1', 'kill me')]);
    await new Promise((r) => setTimeout(r, 0));

    const store = loadStore(localStorage, PROJECT, REVIEWER);
    expect(store?.comments ?? []).toHaveLength(0);
    expect(shadow().querySelectorAll('button.pin')).toHaveLength(0);
    expect(deltas).toEqual(['delete:c1']); // and no phantom re-add announcement
  });

  // Mechanism (verified in review round 2): mergeComments ties are SERVER-
  // wins, so the merge does briefly revert to the server's stale selectors —
  // but the same synchronous render pass re-runs _persistHeal and repairs
  // them again. That guarantee also covers server-NEWER copies with stale
  // selectors, which a tie-break rule never would.
  it('a rejecting hydration clears the tombstone window without side effects', async () => {
    seedStore([makeComment('c1', 'stays')]);
    let rejectSource!: (e: Error) => void;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    annotator = makeAnnotator({
      source: () => new Promise<Comment[]>((_r, rej) => (rejectSource = rej)),
    });
    shadow().querySelector<HTMLDivElement>('.pin')!.click();
    shadow().querySelector<HTMLButtonElement>('button.delete')!.click();
    rejectSource(new Error('offline'));
    await new Promise((r) => setTimeout(r, 0));
    const store = loadStore(localStorage, PROJECT, REVIEWER);
    expect(store?.comments ?? []).toHaveLength(0); // delete stands; no revival, no crash
  });

  it('hydration with a tied-timestamp server copy cannot erase a healed selector', async () => {
    const target = document.createElement('p');
    target.textContent = 'Long-lived hydration heal paragraph target.';
    document.body.appendChild(target);
    const c = makeComment('h1', 'note');
    c.anchor = {
      ...c.anchor,
      selectors: { testid: null, id: null, css: '#stale-css', xpath: '/nope' },
      textFingerprint: 'Long-lived hydration heal paragraph target.',
    };
    // Server copy: same updatedAt, still carrying the stale selectors.
    const serverCopy = JSON.parse(JSON.stringify(c)) as Comment;
    seedStore([c]);
    let resolveSource!: (v: Comment[]) => void;
    annotator = makeAnnotator({
      source: () => new Promise<Comment[]>((r) => (resolveSource = r)),
    });
    // Mount healed the selector already:
    let stored = loadStore(localStorage, PROJECT, REVIEWER)!;
    const healedCss = stored.comments[0]!.anchor.selectors.css;
    expect(healedCss).not.toBe('#stale-css');

    resolveSource([serverCopy]);
    await new Promise((r) => setTimeout(r, 0));

    stored = loadStore(localStorage, PROJECT, REVIEWER)!;
    expect(stored.comments[0]!.anchor.selectors.css).toBe(healedCss);
    expect(shadow().querySelector<HTMLElement>('.pin')!.style.display).not.toBe('none');
  });
});

describe('sheet summon disarms annotate mode (verification round finding)', () => {
  let annotator: Annotator | null = null;

  afterEach(() => {
    annotator?.destroy();
    annotator = null;
    localStorage.clear();
    document.body.innerHTML = '';
    document.body.style.cursor = '';
    vi.restoreAllMocks();
  });

  it('chip-summon while armed disarms — the next outside click cannot plant a comment', () => {
    seedStore([makeComment('c1', 'existing')]);
    annotator = makeAnnotator({ exportUi: 'always' });
    shadow().querySelector<HTMLButtonElement>('button.arm')!.click(); // arms
    expect(document.body.style.cursor).toBe('crosshair');
    chip()!.click(); // summons the sheet over the armed menu
    expect(document.body.style.cursor).toBe('');
    const t = document.createElement('p');
    t.textContent = 'host content the reviewer merely clicks';
    document.body.appendChild(t);
    t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const store = loadStore(localStorage, PROJECT, REVIEWER);
    expect(store?.comments).toHaveLength(1); // no spurious pin
  });

  it("an OPEN sheet's title also refreshes in the HEAL direction", () => {
    const c = makeComment('c1', 'note');
    c.anchor = {
      ...c.anchor,
      selectors: { testid: 'late-heal', id: null, css: '#nope', xpath: '/nope' },
      textFingerprint: 'text that exists nowhere on this page at all',
    };
    seedStore([c]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    chip()!.click();
    expect(shadow().querySelector('.panel h3')?.textContent).toContain('1 unanchored');
    const el2 = document.createElement('div');
    el2.setAttribute('data-testid', 'late-heal');
    document.body.appendChild(el2);
    vi.spyOn(performance, 'now').mockReturnValue(10_000);
    (annotator as unknown as { _repositionPins(): void })._repositionPins();
    expect(shadow().querySelector('.panel h3')?.textContent).not.toContain('unanchored');
  });
});
