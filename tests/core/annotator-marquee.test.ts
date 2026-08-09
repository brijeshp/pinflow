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
  shadow().querySelector<HTMLButtonElement>('.arm')?.click();
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
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
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

  it('areaPercent is relative to the CANONICAL anchor element (data-testid ancestor), not the raw tightest box', () => {
    annotator = makeAnnotator();
    arm();
    const card = document.createElement('div');
    card.dataset['testid'] = 'card';
    const child = document.createElement('div');
    card.appendChild(child);
    document.body.appendChild(card);
    mockRect(card, { left: 0, top: 0, width: 400, height: 400 });
    mockRect(child, { left: 100, top: 100, width: 200, height: 200 });
    mockElementFromPoint(child);

    drag(child, [150, 150], [250, 250]); // contained by child; buildAnchor canonicalizes to card

    const a = comments()[0]!.anchor;
    expect(a.selectors.testid).toBe('card'); // anchored to the card...
    expect(a.areaPercent!.x).toBeCloseTo((150 / 400) * 100, 1); // ...so the rect is card-relative
    expect(a.areaPercent!.w).toBeCloseTo((100 / 400) * 100, 1);
  });

  it('a non-primary (right) button press never starts an armed marquee', () => {
    annotator = makeAnnotator();
    arm();
    const t = hostParagraph();
    t.dispatchEvent(
      ptr('pointerdown', { clientX: 100, clientY: 100, pointerType: 'mouse', button: 2 }),
    );
    t.dispatchEvent(ptr('pointermove', { clientX: 300, clientY: 300, pointerType: 'mouse' }));
    t.dispatchEvent(
      ptr('pointerup', { clientX: 300, clientY: 300, pointerType: 'mouse', button: 2 }),
    );
    expect(comments()).toHaveLength(0);
  });

  it("another pointer's move/release cannot drive or commit the marquee", () => {
    annotator = makeAnnotator();
    arm();
    const t = hostParagraph();
    t.dispatchEvent(
      ptr('pointerdown', { pointerId: 1, clientX: 100, clientY: 100, pointerType: 'mouse' }),
    );
    t.dispatchEvent(
      ptr('pointermove', { pointerId: 2, clientX: 300, clientY: 300, pointerType: 'touch' }),
    );
    t.dispatchEvent(
      ptr('pointerup', { pointerId: 2, clientX: 300, clientY: 300, pointerType: 'touch' }),
    );
    expect(comments()).toHaveLength(0); // stray pointer committed nothing
    t.dispatchEvent(
      ptr('pointerup', { pointerId: 1, clientX: 100, clientY: 100, pointerType: 'mouse' }),
    );
    expect(comments()).toHaveLength(0); // primary released at origin: still just a pending click
  });

  it('dragging out past the threshold and back de-latches — release is a plain click, never a 0×0 area', () => {
    annotator = makeAnnotator();
    arm();
    const t = hostParagraph();
    t.dispatchEvent(ptr('pointerdown', { clientX: 100, clientY: 100, pointerType: 'mouse' }));
    t.dispatchEvent(ptr('pointermove', { clientX: 300, clientY: 300, pointerType: 'mouse' }));
    t.dispatchEvent(ptr('pointermove', { clientX: 103, clientY: 102, pointerType: 'mouse' }));
    t.dispatchEvent(ptr('pointerup', { clientX: 103, clientY: 102, pointerType: 'mouse' }));
    expect(comments()).toHaveLength(0); // no area commit
    t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    const stored = comments();
    expect(stored).toHaveLength(1); // the click path took over
    expect(stored[0]!.anchor.areaPercent).toBeUndefined();
  });

  it('armed coalesced release at the origin (no final move) stays a click — never a 0×0 area', () => {
    annotator = makeAnnotator();
    arm();
    const t = hostParagraph();
    t.dispatchEvent(ptr('pointerdown', { clientX: 100, clientY: 100, pointerType: 'mouse' }));
    t.dispatchEvent(ptr('pointermove', { clientX: 300, clientY: 300, pointerType: 'mouse' })); // latched
    // The return move is coalesced away; only the release arrives near the origin.
    t.dispatchEvent(ptr('pointerup', { clientX: 102, clientY: 101, pointerType: 'mouse' }));
    expect(comments()).toHaveLength(0); // no area commit
    t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    const stored = comments();
    expect(stored).toHaveLength(1); // the click path took over
    expect(stored[0]!.anchor.areaPercent).toBeUndefined();
  });

  it('a multi-pointer abort kills the WHOLE gesture — the trailing click places nothing', () => {
    annotator = makeAnnotator();
    arm();
    const t = hostParagraph();
    t.dispatchEvent(
      ptr('pointerdown', { pointerId: 1, clientX: 100, clientY: 100, pointerType: 'mouse' }),
    );
    t.dispatchEvent(
      ptr('pointermove', { pointerId: 1, clientX: 300, clientY: 300, pointerType: 'mouse' }),
    );
    t.dispatchEvent(
      ptr('pointerdown', { pointerId: 2, clientX: 400, clientY: 400, pointerType: 'touch' }),
    ); // abort
    t.dispatchEvent(
      ptr('pointerup', { pointerId: 1, clientX: 300, clientY: 300, pointerType: 'mouse' }),
    );
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    t.dispatchEvent(click);
    expect(comments()).toHaveLength(0); // neither an area nor a point pin
    expect(click.defaultPrevented).toBe(true); // and the host is shielded too
  });

  it('a click arriving while the marquee is aborted (no release yet) is CONSUMED — the host never sees it', () => {
    annotator = makeAnnotator();
    arm();
    const t = hostParagraph();
    t.dispatchEvent(
      ptr('pointerdown', { pointerId: 1, clientX: 100, clientY: 100, pointerType: 'mouse' }),
    );
    t.dispatchEvent(
      ptr('pointermove', { pointerId: 1, clientX: 300, clientY: 300, pointerType: 'mouse' }),
    );
    t.dispatchEvent(
      ptr('pointerdown', { pointerId: 2, clientX: 400, clientY: 400, pointerType: 'touch' }),
    ); // abort
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    t.dispatchEvent(click); // stray click mid-abort, before any release
    expect(click.defaultPrevented).toBe(true);
    expect(comments()).toHaveLength(0);
  });

  it('initiator-first abort ordering: the JOINER’s later click also places nothing', () => {
    annotator = makeAnnotator();
    arm();
    const t = hostParagraph();
    t.dispatchEvent(
      ptr('pointerdown', { pointerId: 1, clientX: 100, clientY: 100, pointerType: 'mouse' }),
    );
    t.dispatchEvent(
      ptr('pointermove', { pointerId: 1, clientX: 300, clientY: 300, pointerType: 'mouse' }),
    );
    t.dispatchEvent(
      ptr('pointerdown', { pointerId: 2, clientX: 400, clientY: 400, pointerType: 'touch' }),
    ); // abort
    // Initiator releases and clicks FIRST (consumes the one-shot swallow)...
    t.dispatchEvent(
      ptr('pointerup', { pointerId: 1, clientX: 300, clientY: 300, pointerType: 'mouse' }),
    );
    t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(comments()).toHaveLength(0);
    // ...then the joiner releases and its compatibility click arrives.
    t.dispatchEvent(
      ptr('pointerup', { pointerId: 2, clientX: 400, clientY: 400, pointerType: 'touch' }),
    );
    const joinerClick = new MouseEvent('click', { bubbles: true, cancelable: true });
    t.dispatchEvent(joinerClick);
    expect(comments()).toHaveLength(0); // no pin from either ordering
    expect(joinerClick.defaultPrevented).toBe(true);
  });

  it("a joining pointer's EARLY click (before the initiator releases) places nothing", () => {
    annotator = makeAnnotator();
    arm();
    const t = hostParagraph();
    t.dispatchEvent(
      ptr('pointerdown', { pointerId: 1, clientX: 100, clientY: 100, pointerType: 'mouse' }),
    );
    t.dispatchEvent(
      ptr('pointermove', { pointerId: 1, clientX: 300, clientY: 300, pointerType: 'mouse' }),
    );
    t.dispatchEvent(
      ptr('pointerdown', { pointerId: 2, clientX: 400, clientY: 400, pointerType: 'touch' }),
    ); // abort
    // The SECOND pointer lifts and clicks BEFORE the initiator releases.
    t.dispatchEvent(
      ptr('pointerup', { pointerId: 2, clientX: 400, clientY: 400, pointerType: 'touch' }),
    );
    t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(comments()).toHaveLength(0); // no pin from the joiner's click
    t.dispatchEvent(
      ptr('pointerup', { pointerId: 1, clientX: 300, clientY: 300, pointerType: 'mouse' }),
    );
    t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(comments()).toHaveLength(0); // nor from the initiator's
  });

  it("a PRE-EXISTING ignored pointer's cancel cannot skew the abort accounting (codex r5)", () => {
    annotator = makeAnnotator();
    arm();
    const t = hostParagraph();
    // Pointer 3 was down BEFORE the marquee began (armed path ignores touch).
    t.dispatchEvent(
      ptr('pointerdown', { pointerId: 3, clientX: 10, clientY: 10, pointerType: 'touch' }),
    );
    t.dispatchEvent(
      ptr('pointerdown', { pointerId: 1, clientX: 100, clientY: 100, pointerType: 'mouse' }),
    );
    t.dispatchEvent(
      ptr('pointermove', { pointerId: 1, clientX: 300, clientY: 300, pointerType: 'mouse' }),
    );
    t.dispatchEvent(
      ptr('pointerdown', { pointerId: 2, clientX: 400, clientY: 400, pointerType: 'touch' }),
    ); // abort: participants are exactly {1, 2}
    t.dispatchEvent(ptr('pointercancel', { pointerId: 3 })); // the bystander lifts — NOT a participant
    t.dispatchEvent(
      ptr('pointerup', { pointerId: 2, clientX: 400, clientY: 400, pointerType: 'touch' }),
    );
    t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    // Initiator still down — the abort state must still be alive to shield it.
    t.dispatchEvent(
      ptr('pointerup', { pointerId: 1, clientX: 300, clientY: 300, pointerType: 'mouse' }),
    );
    const initiatorClick = new MouseEvent('click', { bubbles: true, cancelable: true });
    t.dispatchEvent(initiatorClick);
    expect(comments()).toHaveLength(0); // no pin from any ordering
    expect(initiatorClick.defaultPrevented).toBe(true);
  });

  it('mid-abort stray clicks are intercepted at WINDOW capture — before pre-pinflow host listeners (codex r5)', () => {
    const hostSeen = vi.fn();
    document.addEventListener('click', hostSeen, true); // registered BEFORE pinflow exists
    try {
      annotator = makeAnnotator();
      arm();
      hostSeen.mockClear(); // the arming click legitimately reached the host
      const t = hostParagraph();
      t.dispatchEvent(
        ptr('pointerdown', { pointerId: 1, clientX: 100, clientY: 100, pointerType: 'mouse' }),
      );
      t.dispatchEvent(
        ptr('pointermove', { pointerId: 1, clientX: 300, clientY: 300, pointerType: 'mouse' }),
      );
      t.dispatchEvent(
        ptr('pointerdown', { pointerId: 2, clientX: 400, clientY: 400, pointerType: 'touch' }),
      ); // abort
      const stray = new MouseEvent('click', { bubbles: true, cancelable: true });
      t.dispatchEvent(stray); // before any release
      expect(hostSeen).not.toHaveBeenCalled(); // never reaches the earlier doc-capture listener
      expect(stray.defaultPrevented).toBe(true);
    } finally {
      document.removeEventListener('click', hostSeen, true);
    }
  });

  it('text selection and native drag are suppressed during an armed marquee press', () => {
    annotator = makeAnnotator();
    arm();
    const t = hostParagraph();
    t.dispatchEvent(ptr('pointerdown', { clientX: 100, clientY: 100, pointerType: 'mouse' }));
    const sel = ptr('selectstart', {});
    t.dispatchEvent(sel);
    expect(sel.defaultPrevented).toBe(true);
    t.dispatchEvent(ptr('pointerup', { clientX: 100, clientY: 100, pointerType: 'mouse' }));
    const after = ptr('selectstart', {});
    t.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false); // press-scoped
  });

  it('the armed-marquee swallow intercepts before host document-capture listeners', () => {
    annotator = makeAnnotator();
    arm();
    const hostSeen = vi.fn();
    // Registered BEFORE the swallow exists (it attaches at pointerup) — the
    // ordering property under test. (After arm(): the arming click itself
    // legitimately reaches host listeners.)
    document.addEventListener('click', hostSeen, true);
    try {
      const t = hostParagraph();
      mockElementFromPoint(t);
      drag(t, [100, 100], [300, 300]);
      t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      expect(hostSeen).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('click', hostSeen, true);
    }
  });

  it('Escape with a HELD press keeps a shield: its release and click never reach the host (ce #2)', () => {
    const hostDown = vi.fn();
    const hostUp = vi.fn();
    document.addEventListener('pointerup', hostUp, true);
    try {
      annotator = makeAnnotator();
      arm();
      const t = hostParagraph();
      t.dispatchEvent(
        ptr('pointerdown', { pointerId: 1, clientX: 100, clientY: 100, pointerType: 'mouse' }),
      );
      t.dispatchEvent(
        ptr('pointermove', { pointerId: 1, clientX: 300, clientY: 300, pointerType: 'mouse' }),
      );
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); // disarm mid-press
      expect(document.body.style.cursor).toBe(''); // teardown happened...
      t.dispatchEvent(
        ptr('pointerup', { pointerId: 1, clientX: 300, clientY: 300, pointerType: 'mouse' }),
      );
      expect(hostUp).not.toHaveBeenCalled(); // ...but the dying press still owns its release
      const click = new MouseEvent('click', { bubbles: true, cancelable: true });
      t.dispatchEvent(click);
      expect(click.defaultPrevented).toBe(true); // and its compatibility click
      expect(comments()).toHaveLength(0);
    } finally {
      document.removeEventListener('pointerdown', hostDown, true);
      document.removeEventListener('pointerup', hostUp, true);
    }
  });

  it('the Escape shield retires on a same-pointer re-press — a lost release cannot poison later clicks (ce #2/#5)', async () => {
    annotator = makeAnnotator();
    arm();
    const t = hostParagraph();
    t.dispatchEvent(
      ptr('pointerdown', { pointerId: 1, clientX: 100, clientY: 100, pointerType: 'mouse' }),
    );
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    // The release is LOST outside the window. Later, the same pointer clicks normally:
    t.dispatchEvent(
      ptr('pointerdown', { pointerId: 1, clientX: 200, clientY: 200, pointerType: 'mouse' }),
    );
    t.dispatchEvent(
      ptr('pointerup', { pointerId: 1, clientX: 200, clientY: 200, pointerType: 'mouse' }),
    );
    await new Promise((r) => setTimeout(r, 0));
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    t.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false); // host click passes — shield retired
  });

  it('accepted armed pointer phases never reach host handlers; touch and own-UI stay native (ce #3)', () => {
    const hostDown = vi.fn();
    const hostUp = vi.fn();
    document.addEventListener('pointerdown', hostDown, true); // host doc-capture, registered first
    document.addEventListener('pointerup', hostUp, true);
    try {
      annotator = makeAnnotator();
      arm();
      const t = hostParagraph();
      hostDown.mockClear();
      hostUp.mockClear();
      // Accepted mouse press: both phases suppressed before the host.
      t.dispatchEvent(
        ptr('pointerdown', { pointerId: 1, clientX: 100, clientY: 100, pointerType: 'mouse' }),
      );
      t.dispatchEvent(
        ptr('pointerup', { pointerId: 1, clientX: 100, clientY: 100, pointerType: 'mouse' }),
      );
      expect(hostDown).not.toHaveBeenCalled();
      expect(hostUp).not.toHaveBeenCalled();
      // The trailing click still places the point pin (armed owns it end-to-end).
      t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      expect(comments()).toHaveLength(1);
      // Touch stays native — the host sees its phases (scroll must work).
      t.dispatchEvent(
        ptr('pointerdown', { pointerId: 7, clientX: 10, clientY: 10, pointerType: 'touch' }),
      );
      t.dispatchEvent(
        ptr('pointerup', { pointerId: 7, clientX: 10, clientY: 10, pointerType: 'touch' }),
      );
      expect(hostDown).toHaveBeenCalledTimes(1);
      expect(hostUp).toHaveBeenCalledTimes(1);
    } finally {
      document.removeEventListener('pointerdown', hostDown, true);
      document.removeEventListener('pointerup', hostUp, true);
    }
  });

  it('a lost marquee release recovers on the same pointer’s next press — fresh marquee, one comment (ce #5)', async () => {
    annotator = makeAnnotator();
    arm();
    const t = hostParagraph();
    mockElementFromPoint(t);
    t.dispatchEvent(
      ptr('pointerdown', { pointerId: 1, clientX: 100, clientY: 100, pointerType: 'mouse' }),
    );
    t.dispatchEvent(
      ptr('pointermove', { pointerId: 1, clientX: 300, clientY: 300, pointerType: 'mouse' }),
    );
    // Release lost outside the window. Same pointer starts over:
    t.dispatchEvent(
      ptr('pointerdown', { pointerId: 1, clientX: 120, clientY: 120, pointerType: 'mouse' }),
    );
    t.dispatchEvent(
      ptr('pointermove', { pointerId: 1, clientX: 320, clientY: 320, pointerType: 'mouse' }),
    );
    t.dispatchEvent(
      ptr('pointerup', { pointerId: 1, clientX: 320, clientY: 320, pointerType: 'mouse' }),
    );
    expect(comments()).toHaveLength(1); // the SECOND drag committed — not a phantom abort
    await new Promise((r) => setTimeout(r, 0));
    const later = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.body.dispatchEvent(later);
    expect(later.defaultPrevented).toBe(false); // no stranded guard
  });

  it('marquee styling: backdrop dim via giant box-shadow, no transition lag', () => {
    const rule = /\.hl\[data-marquee\]\{[^}]*\}/.exec(STYLES)?.[0] ?? '';
    expect(rule).toContain('box-shadow:0 0 0 200vmax');
    expect(rule).toContain('transition:none');
  });

  it('dock glyph buttons carry the -webkit-user-select prefix (iOS Safari long-press)', () => {
    const rule = /\.arm,\.chip\{[^}]*\}/.exec(STYLES)?.[0] ?? '';
    expect(rule).toContain('-webkit-user-select:none');
    expect(rule).toContain('user-select:none');
  });
});
