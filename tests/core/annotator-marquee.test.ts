import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadStore } from '../../src/core/storage';
import type { Comment } from '../../src/core/types';
import { Annotator } from '../../src/core/ui/annotator';
import { STYLES } from '../../src/core/ui/styles';

const PROJECT = 'p';
const REVIEWER = 'Tester';

function shadow(): ShadowRoot {
  const host = document.querySelector('[data-pinflow-root]');
  if (!host?.shadowRoot) throw new Error('pinflow root not mounted');
  return host.shadowRoot;
}

function makeAnnotator(activation?: { mode: 'toggle' | 'stealth' | 'both' }): Annotator {
  return new Annotator({
    config: { project: PROJECT, ...(activation ? { activation } : {}) },
    reviewer: REVIEWER,
    mode: 'reviewer',
    storage: localStorage,
  });
}

function arm(): void {
  shadow().querySelector<HTMLButtonElement>('.control')?.click();
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

// happy-dom has no PointerEvent; plain Events with pointer fields assigned are
// what the annotator's document-level listeners actually receive in tests.
function ptr(type: string, props: Record<string, unknown>): Event {
  const e = new Event(type, { bubbles: true, composed: true, cancelable: true });
  Object.assign(e, props);
  return e;
}

function mockRect(
  el: Element,
  rect: { left: number; top: number; width: number; height: number },
): void {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    ...rect,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    x: rect.left,
    y: rect.top,
    toJSON: () => rect,
  } as DOMRect);
}

function mockElementFromPoint(el: Element | null): void {
  Object.defineProperty(document, 'elementFromPoint', {
    value: vi.fn(() => el),
    configurable: true,
    writable: true,
  });
}

function hostParagraph(): HTMLParagraphElement {
  const p = document.createElement('p');
  p.textContent = 'host paragraph';
  document.body.appendChild(p);
  return p;
}

function drag(
  target: Element,
  from: [number, number],
  to: [number, number],
  pointerType = 'mouse',
): void {
  target.dispatchEvent(ptr('pointerdown', { clientX: from[0], clientY: from[1], pointerType }));
  target.dispatchEvent(ptr('pointermove', { clientX: to[0], clientY: to[1], pointerType }));
  target.dispatchEvent(ptr('pointerup', { clientX: to[0], clientY: to[1], pointerType }));
}

function comments(): Comment[] {
  return loadStore(localStorage, PROJECT, REVIEWER)?.comments ?? [];
}

describe('armed-mode drag-to-marquee (area picker)', () => {
  let annotator: Annotator | null = null;

  afterEach(async () => {
    annotator?.destroy();
    annotator = null;
    localStorage.clear();
    document.body.innerHTML = '';
    document.body.style.cursor = '';
    vi.restoreAllMocks();
    // Flush the one-shot click-swallow window so it can't eat the next test's
    // arming click (in production the 0-timeout fires before any human click).
    await new Promise((r) => setTimeout(r, 0));
  });

  it('a drag past the threshold paints the marquee box in the backdrop state', async () => {
    annotator = makeAnnotator();
    arm();
    const t = hostParagraph();
    t.dispatchEvent(ptr('pointerdown', { clientX: 100, clientY: 100, pointerType: 'mouse' }));
    t.dispatchEvent(ptr('pointermove', { clientX: 300, clientY: 250, pointerType: 'mouse' }));
    await nextFrame();

    const hl = shadow().querySelector<HTMLElement>('.hl');
    expect(hl).not.toBeNull();
    expect(hl!.dataset['marquee']).toBeTruthy();
    expect(hl!.style.left).toBe('100px');
    expect(hl!.style.top).toBe('100px');
    expect(hl!.style.width).toBe('200px');
    expect(hl!.style.height).toBe('150px');
  });

  it('release resolves the TIGHTEST element containing the rect and stores areaPercent relative to it', () => {
    annotator = makeAnnotator();
    arm();
    const outer = document.createElement('div');
    const inner = document.createElement('div');
    const leaf = document.createElement('span');
    inner.appendChild(leaf);
    outer.appendChild(inner);
    document.body.appendChild(outer);
    mockRect(outer, { left: 0, top: 0, width: 800, height: 800 });
    mockRect(inner, { left: 50, top: 50, width: 300, height: 300 });
    mockRect(leaf, { left: 150, top: 150, width: 50, height: 50 }); // too small — climb past it
    mockElementFromPoint(leaf);

    drag(inner, [100, 100], [300, 300]);

    const stored = comments();
    expect(stored).toHaveLength(1);
    const a = stored[0]!.anchor.areaPercent!;
    // Rect (100,100)–(300,300) inside inner (50,50,300×300):
    expect(a['x']).toBeCloseTo(((100 - 50) / 300) * 100, 1);
    expect(a['y']).toBeCloseTo(((100 - 50) / 300) * 100, 1);
    expect(a['w']).toBeCloseTo((200 / 300) * 100, 1);
    expect(a['h']).toBeCloseTo((200 / 300) * 100, 1);
    expect(shadow().querySelector('textarea')).not.toBeNull(); // draft opens as usual
    expect(document.body.style.cursor).toBe(''); // placement disarms
  });

  it('a marquee larger than the resolved element clamps areaPercent to 0–100', () => {
    annotator = makeAnnotator();
    arm();
    const el = hostParagraph();
    mockRect(el, { left: 100, top: 100, width: 100, height: 100 });
    mockRect(document.body, { left: 0, top: 0, width: 1000, height: 1000 });
    mockElementFromPoint(el);
    // Rect exceeds el on every side → climbs to body; percentages stay in range.
    drag(el, [50, 50], [900, 990]);
    const a = comments()[0]!.anchor.areaPercent!;
    for (const k of ['x', 'y', 'w', 'h'] as const) {
      expect(a[k]).toBeGreaterThanOrEqual(0);
      expect(a[k]).toBeLessThanOrEqual(100);
    }
  });

  it('a sub-threshold press stays a point click — the click places a pin with NO areaPercent', () => {
    annotator = makeAnnotator();
    arm();
    const t = hostParagraph();
    drag(t, [100, 100], [104, 103]);
    t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    const stored = comments();
    expect(stored).toHaveLength(1);
    expect(stored[0]!.anchor.areaPercent).toBeUndefined();
  });

  it('the trailing click after a marquee is swallowed — one comment, host protected', () => {
    annotator = makeAnnotator();
    arm();
    const t = hostParagraph();
    mockElementFromPoint(t);
    drag(t, [100, 100], [300, 300]);
    expect(comments()).toHaveLength(1);
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    t.dispatchEvent(click);
    expect(comments()).toHaveLength(1); // no second (point) pin
    expect(click.defaultPrevented).toBe(true); // host handlers never see the drag's click
  });

  it('a LATER genuine click is not eaten by the swallow guard', async () => {
    annotator = makeAnnotator();
    arm();
    const t = hostParagraph();
    mockElementFromPoint(t);
    drag(t, [100, 100], [300, 300]);
    await new Promise((r) => setTimeout(r, 0)); // swallow guard self-clears
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    t.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
  });

  it('Escape mid-drag cancels: no comment, box gone, mode disarmed', async () => {
    annotator = makeAnnotator();
    arm();
    const t = hostParagraph();
    t.dispatchEvent(ptr('pointerdown', { clientX: 100, clientY: 100, pointerType: 'mouse' }));
    t.dispatchEvent(ptr('pointermove', { clientX: 300, clientY: 300, pointerType: 'mouse' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextFrame();
    expect(shadow().querySelector('.hl')).toBeNull();
    expect(comments()).toHaveLength(0);
    // A release after the cancel must not place anything either.
    t.dispatchEvent(ptr('pointerup', { clientX: 300, clientY: 300, pointerType: 'mouse' }));
    expect(comments()).toHaveLength(0);
  });

  it('pointercancel aborts the marquee without placing a comment', async () => {
    annotator = makeAnnotator();
    arm();
    const t = hostParagraph();
    t.dispatchEvent(ptr('pointerdown', { clientX: 100, clientY: 100, pointerType: 'mouse' }));
    t.dispatchEvent(ptr('pointermove', { clientX: 300, clientY: 300, pointerType: 'mouse' }));
    t.dispatchEvent(ptr('pointercancel', {}));
    t.dispatchEvent(ptr('pointerup', { clientX: 300, clientY: 300, pointerType: 'mouse' }));
    expect(comments()).toHaveLength(0);
    await nextFrame();
    expect(shadow().querySelector<HTMLElement>('.hl')?.dataset['marquee']).toBeUndefined();
  });

  it('touch drags never start a marquee — native scroll stays native', () => {
    annotator = makeAnnotator();
    arm();
    const t = hostParagraph();
    drag(t, [100, 100], [300, 300], 'touch');
    expect(comments()).toHaveLength(0);
    expect(shadow().querySelector('[data-marquee]')).toBeNull();
  });

  it('a press starting on pinflow chrome never begins a marquee', () => {
    annotator = makeAnnotator();
    arm();
    const host = document.querySelector('[data-pinflow-root]')!;
    drag(host, [10, 10], [300, 300]);
    expect(comments()).toHaveLength(0);
  });

  it('marquee press listeners exist only while armed (P2 posture)', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    annotator = makeAnnotator({ mode: 'toggle' }); // gesture inert — isolates the marquee listeners
    const adds = (t: string) => addSpy.mock.calls.filter((c) => c[0] === t).length;
    const removes = (t: string) => removeSpy.mock.calls.filter((c) => c[0] === t).length;
    expect(adds('pointerdown')).toBe(0);
    expect(adds('pointerup')).toBe(0);
    arm();
    expect(adds('pointerdown')).toBe(1);
    expect(adds('pointerup')).toBe(1);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(removes('pointerdown')).toBeGreaterThanOrEqual(1);
    expect(removes('pointerup')).toBeGreaterThanOrEqual(1);
  });

  it('marquee styling: backdrop dim via giant box-shadow, no transition lag', () => {
    const rule = /\.hl\[data-marquee\]\{[^}]*\}/.exec(STYLES)?.[0] ?? '';
    expect(rule).toContain('box-shadow:0 0 0 200vmax');
    expect(rule).toContain('transition:none');
  });
});
