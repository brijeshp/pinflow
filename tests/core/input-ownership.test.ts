import { afterEach, describe, expect, it, vi } from 'vitest';
import { GestureController } from '../../src/core/gesture/controller';
import { loadStore } from '../../src/core/storage';
import { Annotator } from '../../src/core/ui/annotator';

// Armed mode and the stealth gesture both claim to OWN the input they accept:
// while a gesture is pinflow's, the host page must see neither its pointer
// phases nor its trailing click, and when pinflow is done the host must get
// every event back. Thirteen ways that contract leaked are pinned here.
//
// Cross-cutting rather than per-file, because the contract itself is spread
// across annotator.ts (armed) and gesture/controller.ts (stealth) and the two
// have to agree — several of the defects were disagreements between them, and
// the touch and pen paths broke in both at once.

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

function armed(): boolean {
  return shadow().querySelector<HTMLElement>('.arm')?.dataset['active'] === 'true';
}

function ptr(type: string, props: Record<string, unknown>): Event {
  const e = new Event(type, { bubbles: true, composed: true, cancelable: true });
  Object.assign(e, props);
  return e;
}

function clickOn(target: EventTarget): MouseEvent {
  const e = new MouseEvent('click', { bubbles: true, composed: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
}

// Dispatches and returns the event, so a test can assert on defaultPrevented.
function fire(target: EventTarget, type: string, props: Record<string, unknown> = {}): Event {
  const e = ptr(type, props);
  target.dispatchEvent(e);
  return e;
}

describe('input ownership — armed mode (annotator)', () => {
  let a: Annotator | null = null;
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    a?.destroy();
    a = null;
    cleanups.forEach((f) => f());
    cleanups.length = 0;
    document.body.innerHTML = '';
    localStorage.clear();
    vi.restoreAllMocks();
  });

  function host(): HTMLElement {
    let el = document.getElementById('host-target') as HTMLElement | null;
    if (!el) {
      el = document.createElement('div');
      el.id = 'host-target';
      document.body.appendChild(el);
    }
    return el;
  }

  function hostSpy(type: string): ReturnType<typeof vi.fn> {
    const spy = vi.fn();
    window.addEventListener(type, spy, true);
    cleanups.push(() => window.removeEventListener(type, spy, true));
    return spy;
  }

  // stopPropagation cannot silence a listener on the SAME node and phase, and
  // pinflow's armed click handler lives on window capture — where a host's own
  // outside-click dismiss, router, or analytics listener also lives. Every
  // sibling armed handler already used stopImmediatePropagation; this one did
  // not, so a host listener registered after init still saw armed clicks.
  it('a host window-capture click listener never sees an armed click', () => {
    const target = document.createElement('button');
    document.body.appendChild(target);
    a = makeAnnotator();
    arm();
    const host = hostSpy('click');
    clickOn(target);
    expect(host).not.toHaveBeenCalled();
  });

  // The initiator's pointerdown was eaten when it was accepted, so releasing it
  // to the host after an abort hands over a pointerup with no matching down —
  // enough to desync any drag surface.
  it('after an abort, the accepted press keeps its own pointerup', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    a = makeAnnotator();
    arm();
    const hostUp = hostSpy('pointerup');
    host().dispatchEvent(
      ptr('pointerdown', { pointerId: 1, clientX: 10, clientY: 10, isPrimary: true, button: 0 }),
    );
    host().dispatchEvent(ptr('pointermove', { pointerId: 1, clientX: 40, clientY: 40 }));
    host().dispatchEvent(
      ptr('pointerdown', { pointerId: 2, clientX: 80, clientY: 80, isPrimary: false, button: 0 }),
    );
    host().dispatchEvent(ptr('pointerup', { pointerId: 1, clientX: 40, clientY: 40 }));
    expect(hostUp).not.toHaveBeenCalled();
  });

  // A participant pressing again proves its release was lost outside the
  // window. The non-aborted path already honours that ("the first retry is
  // never eaten"); the aborted path did not, so the gesture could strand.
  it('a re-press by a stranded participant retires the abort instead of being eaten', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    a = makeAnnotator();
    arm();
    host().dispatchEvent(
      ptr('pointerdown', { pointerId: 1, clientX: 10, clientY: 10, isPrimary: true, button: 0 }),
    );
    host().dispatchEvent(ptr('pointermove', { pointerId: 1, clientX: 40, clientY: 40 }));
    host().dispatchEvent(
      ptr('pointerdown', { pointerId: 2, clientX: 80, clientY: 80, isPrimary: false, button: 0 }),
    );
    // id2 lifts; id1's release is lost outside the window.
    host().dispatchEvent(ptr('pointerup', { pointerId: 2, clientX: 80, clientY: 80 }));
    const stray = document.createElement('div');
    document.body.appendChild(stray);
    // Positive control: the abort really is in flight, so it really is eating
    // page clicks. Without this the assertion below passes on a page that
    // never aborted at all.
    expect(clickOn(stray).defaultPrevented).toBe(true);
    // id1 returns. This must retire the stranded abort, not be swallowed.
    host().dispatchEvent(
      ptr('pointerdown', { pointerId: 1, clientX: 20, clientY: 20, isPrimary: true, button: 0 }),
    );
    host().dispatchEvent(ptr('pointerup', { pointerId: 1, clientX: 20, clientY: 20 }));
    // The gesture layer is usable again. Armed mode still consumes the click —
    // that is its job — but under a stranded abort it consumed it and placed
    // NOTHING, which is the difference this asserts.
    clickOn(host());
    expect(loadStore(localStorage, PROJECT, REVIEWER)?.comments ?? []).toHaveLength(1);
  });

  // The abort guard is a blanket window-capture click killer. It must never
  // eat a click on pinflow's OWN chrome, or a stranded abort leaves the
  // reviewer unable to press the arm segment to get out.
  it('pinflow chrome stays clickable while an abort is in flight', () => {
    a = makeAnnotator();
    arm();
    expect(armed()).toBe(true);
    host().dispatchEvent(
      ptr('pointerdown', { pointerId: 1, clientX: 10, clientY: 10, isPrimary: true, button: 0 }),
    );
    host().dispatchEvent(ptr('pointermove', { pointerId: 1, clientX: 40, clientY: 40 }));
    host().dispatchEvent(
      ptr('pointerdown', { pointerId: 2, clientX: 80, clientY: 80, isPrimary: false, button: 0 }),
    );
    // Mid-abort, the reviewer reaches for the dock to disarm.
    shadow().querySelector<HTMLButtonElement>('.arm')!.click();
    expect(armed()).toBe(false);
  });

  // The dying-press shield adds three window-capture listeners that retire on
  // that pointer's next event. Touch and pen never reuse an id, so a shield
  // orphaned by destroy() would eat host input forever and pin the Annotator
  // and its shadow tree in memory.
  it('destroy() releases a dying-press shield', () => {
    a = makeAnnotator();
    arm();
    host().dispatchEvent(
      ptr('pointerdown', { pointerId: 7, clientX: 10, clientY: 10, isPrimary: true, button: 0 }),
    );
    a.destroy();
    a = null;
    const hostUp = hostSpy('pointerup');
    window.dispatchEvent(ptr('pointerup', { pointerId: 7, clientX: 10, clientY: 10 }));
    expect(hostUp).toHaveBeenCalledTimes(1);
  });
});

describe('input ownership — stealth gesture (controller)', () => {
  let gc: GestureController | null = null;
  let activations = 0;

  function start(opts?: Partial<{ suspended: () => boolean }>): void {
    activations = 0;
    gc = new GestureController({
      mode: 'stealth',
      longPressMs: 500,
      moveThresholdPx: 10,
      onActivate: () => {
        activations++;
      },
      ...opts,
    });
    gc.start();
  }

  function down(id: number, x: number, y: number): void {
    document.body.dispatchEvent(
      ptr('pointerdown', {
        pointerId: id,
        clientX: x,
        clientY: y,
        pointerType: 'touch',
        button: 0,
      }),
    );
  }
  function up(id: number, x: number, y: number): void {
    document.body.dispatchEvent(
      ptr('pointerup', { pointerId: id, clientX: x, clientY: y, pointerType: 'touch', button: 0 }),
    );
  }

  afterEach(() => {
    gc?.stop();
    gc = null;
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  // The long-press fires while the finger is still down, so arming the
  // click-swallow at ACTIVATION spends the whole window during the hold. Past
  // ~1.2s the trailing compatibility click reached the host — on a prototype
  // that is a real navigation or submit under the reviewer's finger.
  it('a long touch hold still swallows its compatibility click', () => {
    vi.useFakeTimers();
    start();
    down(1, 30, 40);
    vi.advanceTimersByTime(500);
    expect(activations).toBe(1);
    vi.advanceTimersByTime(800); // routine 1.3s hold
    up(1, 30, 40);
    expect(clickOn(document.body).defaultPrevented).toBe(true);
  });

  // A retired press keeps its release shielded, and while it is outstanding a
  // second pointer is still treated as multi-touch — that guard is deliberate.
  // What was wrong is that it had no end: the shield sat in the press slot and
  // only its OWN release could clear it, but touch and pen mint a fresh id per
  // contact, so a lost release bricked the gesture layer for the page's life.
  it('a stranded shield blocks briefly, then releases the gesture layer', () => {
    vi.useFakeTimers();
    start();
    down(5, 10, 10);
    gc!.suspendPress(); // armed mode took over; this press's release is then lost

    // Multi-touch guard intact: another finger during the shield does nothing.
    down(6, 20, 20);
    vi.advanceTimersByTime(600);
    expect(activations).toBe(0);

    // But the shield is bounded, so the layer comes back on its own.
    vi.advanceTimersByTime(10_000);
    down(7, 30, 30);
    vi.advanceTimersByTime(600);
    expect(activations).toBe(1);
  });
});

describe('touch and pen input', () => {
  let gc: GestureController | null = null;
  let a: Annotator | null = null;
  let activations: Array<{ x: number; y: number }> = [];

  afterEach(() => {
    gc?.stop();
    gc = null;
    a?.destroy();
    a = null;
    activations = [];
    vi.useRealTimers();
    document.body.innerHTML = '';
    localStorage.clear();
  });

  function startController(longPressMs = 500): HTMLElement {
    const el = document.createElement('div');
    document.body.appendChild(el);
    activations = [];
    gc = new GestureController({
      mode: 'stealth',
      longPressMs,
      moveThresholdPx: 10,
      onActivate: (x, y) => {
        activations.push({ x, y });
      },
    });
    gc.start();
    return el;
  }

  // Cancelling a pointerdown suppresses compatibility mouse events for MOUSE
  // input only; for touch the spec routes them through touchstart, which
  // pinflow does not listen to. So the host's mousedown/mouseup handlers —
  // canvas apps, drag surfaces, :active widgets — fired on every annotation
  // gesture even though the click was correctly swallowed.
  it('a touch activation swallows the compatibility mousedown and mouseup', () => {
    vi.useFakeTimers();
    const el = startController();
    fire(el, 'pointerdown', { pointerId: 1, clientX: 10, clientY: 10, pointerType: 'touch' });
    vi.advanceTimersByTime(500);
    expect(activations).toHaveLength(1);
    fire(el, 'pointerup', { pointerId: 1, clientX: 10, clientY: 10, pointerType: 'touch' });
    expect(fire(el, 'mousedown', {}).defaultPrevented).toBe(true);
    expect(fire(el, 'mouseup', {}).defaultPrevented).toBe(true);
  });

  // A genuine host mousedown, long after any gesture, must still get through —
  // the swallow is a one-shot window, not a permanent mute.
  it('a later genuine mousedown is not swallowed', () => {
    vi.useFakeTimers();
    const el = startController();
    fire(el, 'pointerdown', { pointerId: 1, clientX: 10, clientY: 10, pointerType: 'touch' });
    vi.advanceTimersByTime(500);
    fire(el, 'pointerup', { pointerId: 1, clientX: 10, clientY: 10, pointerType: 'touch' });
    vi.advanceTimersByTime(5000);
    expect(fire(el, 'mousedown', {}).defaultPrevented).toBe(false);
  });

  // Apple Pencil and the Surface pen report pointerType 'pen'. They were routed
  // into the desktop branch, which demands an Alt key the pen's hand does not
  // have — so in stealth mode (no visible dock) pinflow was unusable with a pen.
  it('a pen long-press activates like touch', () => {
    vi.useFakeTimers();
    const el = startController();
    fire(el, 'pointerdown', { pointerId: 3, clientX: 20, clientY: 30, pointerType: 'pen' });
    vi.advanceTimersByTime(500);
    expect(activations).toEqual([{ x: 20, y: 30 }]);
  });

  // A pen press that travels is a scroll/draw, not a pin — same as touch.
  it('a pen press that moves past the threshold does not activate', () => {
    vi.useFakeTimers();
    const el = startController();
    fire(el, 'pointerdown', { pointerId: 3, clientX: 20, clientY: 30, pointerType: 'pen' });
    fire(el, 'pointermove', { pointerId: 3, clientX: 60, clientY: 80, pointerType: 'pen' });
    vi.advanceTimersByTime(500);
    expect(activations).toHaveLength(0);
  });

  // The OS long-press recognizers fire at ~500ms too, so an equal threshold is
  // a coin flip: lose and the platform takes the gesture (pinflow silently does
  // nothing); win and the draft opens under iOS's selection handles.
  it('activates before the ~500ms platform long-press recognizer', () => {
    vi.useFakeTimers();
    const el = document.createElement('div');
    document.body.appendChild(el);
    a = new Annotator({
      config: { project: PROJECT, activation: { mode: 'stealth' } },
      reviewer: REVIEWER,
      mode: 'reviewer',
      storage: localStorage,
    });
    fire(el, 'pointerdown', { pointerId: 1, clientX: 10, clientY: 10, pointerType: 'touch' });
    vi.advanceTimersByTime(450);
    expect(shadow().querySelector('textarea')).toBeTruthy();
  });

  // Dismissing a draft by tapping outside must not also operate the host
  // control underneath — the reviewer means "close this", not "click that".
  it('tapping outside to dismiss a draft does not click the host underneath', async () => {
    const el = document.createElement('button');
    document.body.appendChild(el);
    a = new Annotator({
      config: { project: PROJECT },
      reviewer: REVIEWER,
      mode: 'reviewer',
      storage: localStorage,
    });
    shadow().querySelector<HTMLButtonElement>('.arm')!.click();
    // Place a pin so a draft popup is open.
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, cancelable: true }));
    expect(shadow().querySelector('textarea')).toBeTruthy();
    // The outside-dismiss listeners attach on a timeout so the opening click
    // cannot immediately close the surface it just opened.
    await new Promise((r) => setTimeout(r, 0));
    // Tap outside it.
    fire(el, 'pointerdown', { pointerId: 1, clientX: 5, clientY: 5, isPrimary: true });
    fire(el, 'pointerup', { pointerId: 1, clientX: 5, clientY: 5, isPrimary: true });
    const trailing = new MouseEvent('click', {
      bubbles: true,
      composed: true,
      cancelable: true,
    });
    el.dispatchEvent(trailing);
    expect(trailing.defaultPrevented).toBe(true);
  });
});
