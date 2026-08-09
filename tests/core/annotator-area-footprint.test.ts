import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyStore, loadStore, saveStore } from '../../src/core/storage';
import { routeKey } from '../../src/core/route-key';
import type { AreaPercent, Comment } from '../../src/core/types';
import { Annotator } from '../../src/core/ui/annotator';
import { STYLES } from '../../src/core/ui/styles';

const PROJECT = 'p';
const REVIEWER = 'Tester';

function shadow(): ShadowRoot {
  const host = document.querySelector('[data-pinflow-root]');
  if (!host?.shadowRoot) throw new Error('pinflow root not mounted');
  return host.shadowRoot;
}

function makeComment(id: string, extra?: Partial<Comment> & { area?: AreaPercent }): Comment {
  const { area, ...rest } = extra ?? {};
  return {
    id,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    route: routeKey(),
    fullUrl: window.location.href,
    text: 'note',
    modality: 'text',
    anchor: {
      selectors: { testid: null, id: null, css: 'body', xpath: '/html/body' },
      textFingerprint: '',
      positionPercent: { x: 50, y: 50 },
      viewport: { width: 800, height: 600 },
      ...(area ? { areaPercent: area } : {}),
    },
    ...rest,
  };
}

function seed(comments: Comment[]): void {
  saveStore(localStorage, { ...emptyStore(PROJECT, REVIEWER), comments });
}

function makeAnnotator(mode: 'reviewer' | 'builder' = 'reviewer'): Annotator {
  return new Annotator({
    config: { project: PROJECT },
    reviewer: REVIEWER,
    mode,
    storage: localStorage,
  });
}

function mockBodyRect(rect: { left: number; top: number; width: number; height: number }): void {
  vi.spyOn(document.body, 'getBoundingClientRect').mockReturnValue({
    ...rect,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    x: rect.left,
    y: rect.top,
    toJSON: () => rect,
  } as DOMRect);
}

interface Repositionable {
  _repositionPins(): void;
}

describe('area footprint (marching ants)', () => {
  let annotator: Annotator | null = null;

  afterEach(async () => {
    annotator?.destroy();
    annotator = null;
    localStorage.clear();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    // Flush the one-shot click-swallow window so a marquee release in one test
    // can't eat the next test's arming click (production clears it in 0ms).
    await new Promise((r) => setTimeout(r, 0));
  });

  it('an area comment renders a .area footprint at the anchored element rect × areaPercent', () => {
    mockBodyRect({ left: 0, top: 0, width: 1000, height: 500 });
    seed([makeComment('a1', { area: { x: 10, y: 20, w: 50, h: 40 } })]);
    annotator = makeAnnotator();
    const area = shadow().querySelector<HTMLElement>('.area');
    expect(area).not.toBeNull();
    expect(area!.style.left).toBe('100px'); // 10% of 1000
    expect(area!.style.top).toBe('100px'); // 20% of 500
    expect(area!.style.width).toBe('500px'); // 50% of 1000
    expect(area!.style.height).toBe('200px'); // 40% of 500
  });

  it('point comments render NO footprint', () => {
    seed([makeComment('p1')]);
    annotator = makeAnnotator();
    expect(shadow().querySelector('.pin')).not.toBeNull();
    expect(shadow().querySelector('.area')).toBeNull();
  });

  it('reflow repositions the footprint with the pins (no rebuild)', () => {
    mockBodyRect({ left: 0, top: 0, width: 1000, height: 500 });
    seed([makeComment('a1', { area: { x: 10, y: 20, w: 50, h: 40 } })]);
    annotator = makeAnnotator();
    const area = shadow().querySelector<HTMLElement>('.area')!;
    // The host scrolls: the anchored element's rect shifts.
    mockBodyRect({ left: 0, top: -100, width: 1000, height: 500 });
    (annotator as unknown as Repositionable)._repositionPins();
    expect(area.style.top).toBe('0px'); // -100 + 20% of 500
    expect(area.isConnected).toBe(true); // repositioned, not recreated
  });

  it('an orphaned area comment hides its footprint with its pin', () => {
    seed([
      makeComment('a1', {
        area: { x: 10, y: 10, w: 30, h: 30 },
        anchor: {
          selectors: { testid: null, id: null, css: '#gone', xpath: '/html/body/div[99]' },
          textFingerprint: 'text that exists nowhere on this page at all',
          positionPercent: { x: 50, y: 50 },
          viewport: { width: 800, height: 600 },
          areaPercent: { x: 10, y: 10, w: 30, h: 30 },
        },
      }),
    ]);
    annotator = makeAnnotator();
    const pin = shadow().querySelector<HTMLElement>('.pin')!;
    expect(pin.style.display).toBe('none');
    expect(shadow().querySelector<HTMLElement>('.area')!.style.display).toBe('none');
  });

  it('a dispositioned area comment mutes its footprint like its pin', () => {
    seed([makeComment('a1', { area: { x: 5, y: 5, w: 20, h: 20 }, status: 'done' })]);
    annotator = makeAnnotator();
    expect(shadow().querySelector<HTMLElement>('.area')!.dataset['status']).toBe('done');
  });

  it('builder mode renders footprints for aggregated area comments', () => {
    seed([makeComment('a1', { area: { x: 5, y: 5, w: 20, h: 20 } })]);
    annotator = makeAnnotator('builder');
    expect(shadow().querySelector('.area')).not.toBeNull();
  });

  it('a live marquee release leaves its footprint behind immediately', () => {
    mockBodyRect({ left: 0, top: 0, width: 1000, height: 1000 });
    annotator = makeAnnotator();
    shadow().querySelector<HTMLButtonElement>('.arm')!.click();
    const t = document.createElement('p');
    document.body.appendChild(t);
    const ptr = (type: string, props: Record<string, unknown>): Event => {
      const e = new Event(type, { bubbles: true, composed: true, cancelable: true });
      Object.assign(e, { pointerId: 1, button: 0, pointerType: 'mouse', ...props });
      return e;
    };
    t.dispatchEvent(ptr('pointerdown', { clientX: 100, clientY: 100 }));
    t.dispatchEvent(ptr('pointermove', { clientX: 300, clientY: 300 }));
    t.dispatchEvent(ptr('pointerup', { clientX: 300, clientY: 300 }));
    expect(shadow().querySelector('.area')).not.toBeNull(); // the drawn region settled in place
  });

  it('a stored compound-overflow rect renders CLAMPED to the anchor bounds (codex fr1 P2)', () => {
    mockBodyRect({ left: 0, top: 0, width: 1000, height: 500 });
    // Each leaf passes 0–100 validation, but x+w = 190% — untrusted data must
    // not paint over unrelated host content beyond the anchor.
    seed([makeComment('a1', { area: { x: 90, y: 90, w: 100, h: 100 } })]);
    annotator = makeAnnotator();
    const area = shadow().querySelector<HTMLElement>('.area')!;
    expect(area.style.left).toBe('900px');
    expect(area.style.width).toBe('100px'); // min(w, 100 - x) → 10% of 1000
    expect(area.style.height).toBe('50px'); // min(h, 100 - y) → 10% of 500
  });

  it('an axis-aligned (zero-height) area still renders a visible footprint (codex fr1 P3)', () => {
    mockBodyRect({ left: 0, top: 0, width: 1000, height: 500 });
    seed([makeComment('a1', { area: { x: 10, y: 20, w: 30, h: 0 } })]);
    annotator = makeAnnotator();
    const area = shadow().querySelector<HTMLElement>('.area')!;
    expect(area.style.height).toBe('2px'); // floored — a drawn line is not invisible
    expect(area.style.width).toBe('300px');
  });

  it('the 2px floor shifts INWARD at clamped edges — never past the anchor (codex fr2 P2)', () => {
    mockBodyRect({ left: 0, top: 0, width: 1000, height: 500 });
    // Fully edge-clamped rect: position at 100%, extent clamps to 0, floor
    // kicks in — the floored box must sit INSIDE the anchor's far corner.
    seed([makeComment('a1', { area: { x: 100, y: 100, w: 100, h: 100 } })]);
    annotator = makeAnnotator();
    const area = shadow().querySelector<HTMLElement>('.area')!;
    expect(area.style.width).toBe('2px');
    expect(area.style.height).toBe('2px');
    expect(area.style.left).toBe('998px'); // 1000 − 2, not 1000
    expect(area.style.top).toBe('498px'); // 500 − 2, not 500
  });

  it('a fresh marquee never STORES a compound-overflow rect (x+w, y+h ≤ 100)', () => {
    mockBodyRect({ left: 0, top: 0, width: 1000, height: 1000 });
    annotator = makeAnnotator();
    shadow().querySelector<HTMLButtonElement>('.arm')!.click();
    const t = document.createElement('p');
    document.body.appendChild(t);
    const ptr = (type: string, props: Record<string, unknown>): Event => {
      const e = new Event(type, { bubbles: true, composed: true, cancelable: true });
      Object.assign(e, { pointerId: 1, button: 0, pointerType: 'mouse', ...props });
      return e;
    };
    // Drag starting mid-element and running far past its right/bottom edges.
    t.dispatchEvent(ptr('pointerdown', { clientX: 500, clientY: 500 }));
    t.dispatchEvent(ptr('pointermove', { clientX: 2500, clientY: 2500 }));
    t.dispatchEvent(ptr('pointerup', { clientX: 2500, clientY: 2500 }));
    const a = loadStore(localStorage, PROJECT, REVIEWER)!.comments[0]!.anchor.areaPercent!;
    expect(a.x + a.w).toBeLessThanOrEqual(100);
    expect(a.y + a.h).toBeLessThanOrEqual(100);
  });

  it('footprint styling: non-interactive marching ants in currentColor, frozen under reduced motion', () => {
    const rule = /\.area\{[^}]*\}/.exec(STYLES)?.[0] ?? '';
    expect(rule).toContain('pointer-events:none');
    expect(rule).toContain('position:fixed');
    expect(rule).toMatch(/repeating-linear-gradient/); // the four-edge ants
    expect(rule).toMatch(/animation:[^;]*march/);
    // currentColor gradients: one color override handles the muted state.
    expect(rule).toContain('currentColor');
    expect(STYLES).toMatch(/\.area\[data-status\]\{[^}]*color:/);
    const reduced = /@media \(prefers-reduced-motion:reduce\)\{[^@]*\}/.exec(STYLES)?.[0] ?? '';
    expect(reduced).toContain('.area{animation:none}');
    // Paint order: footprints sit BELOW every pin and the dock — negative
    // z-index inside .root's stacking context (codex fr1 P3).
    expect(/\.area\{[^}]*\}/.exec(STYLES)?.[0] ?? '').toContain('z-index:-1');
  });
});
