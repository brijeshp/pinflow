import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyStore, loadStore, saveStore } from '../../src/core/storage';
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

function seed(comments: Comment[]): void {
  saveStore(localStorage, { ...emptyStore(PROJECT, REVIEWER), comments });
}

function makeAnnotator(extra?: {
  mode?: 'reviewer' | 'builder';
  activation?: { mode: 'toggle' | 'stealth' | 'both' };
}): Annotator {
  return new Annotator({
    config: { project: PROJECT, ...(extra?.activation ? { activation: extra.activation } : {}) },
    reviewer: REVIEWER,
    mode: extra?.mode ?? 'reviewer',
    storage: localStorage,
  });
}

const armBtn = (): HTMLButtonElement | null => shadow().querySelector<HTMLButtonElement>('.arm');
const countChip = (): HTMLButtonElement | null =>
  shadow().querySelector<HTMLButtonElement>('.chip');

function ptr(type: string, props: Record<string, unknown>): Event {
  const e = new Event(type, { bubbles: true, composed: true, cancelable: true });
  Object.assign(e, { pointerId: 1, button: 0, ...props });
  return e;
}

describe('bottom-left dock (0.5.0 — the bottom-right control is gone)', () => {
  let annotator: Annotator | null = null;

  afterEach(async () => {
    annotator?.destroy();
    annotator = null;
    localStorage.clear();
    document.body.innerHTML = '';
    document.body.style.cursor = '';
    vi.restoreAllMocks();
    await new Promise((r) => setTimeout(r, 0)); // flush click-swallow windows
  });

  it('no .control exists anywhere; the dock holds the arm segment even at zero comments', () => {
    annotator = makeAnnotator();
    expect(shadow().querySelector('.control')).toBeNull();
    expect(shadow().querySelector('.dock')).not.toBeNull();
    expect(armBtn()).not.toBeNull();
    expect(countChip()).toBeNull(); // no count segment with nothing to export
  });

  it('arm segment toggles armed mode: crosshair + active state + stop glyph, then back', () => {
    annotator = makeAnnotator();
    const arm = armBtn()!;
    expect(arm.textContent).toBe('+');
    arm.click();
    expect(document.body.style.cursor).toBe('crosshair');
    expect(arm.dataset['active']).toBe('true');
    expect(arm.textContent).toBe('×');
    arm.click();
    expect(document.body.style.cursor).toBe('');
    expect(arm.dataset['active']).toBe('false');
    expect(arm.textContent).toBe('+');
  });

  it('Escape disarms and the arm segment reflects it', () => {
    annotator = makeAnnotator();
    armBtn()!.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(armBtn()!.dataset['active']).toBe('false');
    expect(armBtn()!.textContent).toBe('+');
  });

  it('the count segment appears beside the arm once comments exist, and opens the sheet', () => {
    seed([makeComment('c1', 'one')]);
    annotator = makeAnnotator();
    expect(countChip()?.textContent).toBe('1');
    countChip()!.click();
    expect(shadow().querySelector('.panel')).not.toBeNull(); // export sheet
  });

  it('stealth mode has NO arm segment — only the count chip when comments exist', () => {
    seed([makeComment('c1', 'one')]);
    annotator = makeAnnotator({ activation: { mode: 'stealth' } });
    expect(armBtn()).toBeNull();
    expect(countChip()?.textContent).toBe('1');
  });

  it('builder mode: the dock chip shows the count and toggles the drawer, no crosshair', () => {
    seed([makeComment('c1', 'one')]);
    annotator = makeAnnotator({ mode: 'builder' });
    expect(armBtn()).toBeNull(); // builder never arms
    const chip = countChip()!;
    expect(chip.textContent).toBe('1');
    chip.click();
    expect(shadow().querySelector('.drawer')).not.toBeNull();
    expect(document.body.style.cursor).toBe('');
    chip.click();
    expect(shadow().querySelector('.drawer')).toBeNull();
  });

  it('builder chip announces its drawer state (aria-expanded/controls)', () => {
    seed([makeComment('c1', 'one')]);
    annotator = makeAnnotator({ mode: 'builder' });
    const chip = countChip()!;
    expect(chip.getAttribute('aria-expanded')).toBe('false');
    chip.click();
    expect(chip.getAttribute('aria-expanded')).toBe('true');
    const drawer = shadow().querySelector('.drawer')!;
    expect(chip.getAttribute('aria-controls')).toBe(drawer.id);
    expect(drawer.id).toBeTruthy();
    chip.click();
    expect(chip.getAttribute('aria-expanded')).toBe('false');
  });

  it('closing the drawer through ANY path resets aria-expanded (builder Clear all)', () => {
    seed([makeComment('c1', 'one')]);
    annotator = makeAnnotator({ mode: 'builder' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const chip = countChip()!;
    chip.click();
    expect(chip.getAttribute('aria-expanded')).toBe('true');
    const clear = [...shadow().querySelectorAll('button')].find(
      (b) => b.textContent === 'Clear all',
    )!;
    clear.click(); // closes the drawer via _closePanel, not the chip toggle
    expect(shadow().querySelector('.drawer')).toBeNull();
    expect(chip.getAttribute('aria-expanded')).toBe('false');
  });

  it('both segments carry aria-labels (icon-only buttons must be named)', () => {
    seed([makeComment('c1', 'one')]);
    annotator = makeAnnotator();
    expect(armBtn()!.getAttribute('aria-label')).toBeTruthy();
    expect(countChip()!.getAttribute('aria-label')).toBeTruthy();
  });
});

describe('stealth Alt+drag marquee (gesture grammar: Alt+click = point, Alt+drag = area)', () => {
  let annotator: Annotator | null = null;

  afterEach(async () => {
    annotator?.destroy();
    annotator = null;
    localStorage.clear();
    document.body.innerHTML = '';
    document.body.style.cursor = '';
    vi.restoreAllMocks();
    await new Promise((r) => setTimeout(r, 0));
  });

  function nextFrame(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  function altDrag(target: Element, from: [number, number], to: [number, number]): void {
    target.dispatchEvent(
      ptr('pointerdown', {
        pointerType: 'mouse',
        altKey: true,
        clientX: from[0],
        clientY: from[1],
      }),
    );
    target.dispatchEvent(
      ptr('pointermove', { pointerType: 'mouse', clientX: to[0], clientY: to[1] }),
    );
    target.dispatchEvent(
      ptr('pointerup', { pointerType: 'mouse', clientX: to[0], clientY: to[1] }),
    );
  }

  it('Alt+drag WITHOUT arming places an area comment and paints the marquee box', async () => {
    annotator = makeAnnotator(); // 'both' default — gesture live, mode never armed
    // happy-dom rects are 0×0; give the fallback anchor (body) a real box so
    // the percentage math has something to divide by.
    vi.spyOn(document.body, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1000,
      height: 1000,
      right: 1000,
      bottom: 1000,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    const t = document.createElement('p');
    t.textContent = 'host paragraph';
    document.body.appendChild(t);

    t.dispatchEvent(
      ptr('pointerdown', { pointerType: 'mouse', altKey: true, clientX: 100, clientY: 100 }),
    );
    t.dispatchEvent(ptr('pointermove', { pointerType: 'mouse', clientX: 300, clientY: 250 }));
    await nextFrame();
    const hl = shadow().querySelector<HTMLElement>('.hl');
    expect(hl?.dataset['marquee']).toBeTruthy(); // live marquee visual mid-drag
    t.dispatchEvent(ptr('pointerup', { pointerType: 'mouse', clientX: 300, clientY: 250 }));

    const stored = loadStore(localStorage, PROJECT, REVIEWER)?.comments ?? [];
    expect(stored).toHaveLength(1);
    expect(stored[0]!.anchor.areaPercent).toBeDefined();
    expect(shadow().querySelector('.hl')).toBeNull(); // visual cleaned up after commit
  });

  it('Alt+click (no drag) still places a point pin on release', () => {
    annotator = makeAnnotator();
    const t = document.createElement('p');
    document.body.appendChild(t);
    t.dispatchEvent(
      ptr('pointerdown', { pointerType: 'mouse', altKey: true, clientX: 50, clientY: 50 }),
    );
    t.dispatchEvent(ptr('pointerup', { pointerType: 'mouse', clientX: 50, clientY: 50 }));
    const stored = loadStore(localStorage, PROJECT, REVIEWER)?.comments ?? [];
    expect(stored).toHaveLength(1);
    expect(stored[0]!.anchor.areaPercent).toBeUndefined();
  });

  it('while ARMED, an Alt+drag places exactly one area comment (no gesture double-fire)', async () => {
    annotator = makeAnnotator();
    shadow().querySelector<HTMLButtonElement>('.arm')!.click(); // armed
    const t = document.createElement('p');
    document.body.appendChild(t);
    altDrag(t, [100, 100], [300, 300]);
    await new Promise((r) => setTimeout(r, 0));
    const stored = loadStore(localStorage, PROJECT, REVIEWER)?.comments ?? [];
    expect(stored).toHaveLength(1);
  });
});
