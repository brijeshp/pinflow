import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GestureController,
  type GestureControllerOptions,
} from '../../src/core/gesture/controller';

// happy-dom has no PointerEvent constructor; synthesize a dispatchable event and
// attach the props the controller reads. Runtime reads the assigned values.
function dispatch(target: EventTarget, type: string, props: Record<string, unknown> = {}): Event {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, {
    pointerId: 1,
    pointerType: 'touch',
    clientX: 10,
    clientY: 20,
    altKey: false,
    button: 0,
    ...props,
  });
  target.dispatchEvent(e);
  return e;
}

const live: GestureController[] = [];

function setup(overrides: Partial<GestureControllerOptions> = {}): {
  controller: GestureController;
  activations: Array<{ x: number; y: number; target: Element }>;
  el: HTMLElement;
} {
  const activations: Array<{ x: number; y: number; target: Element }> = [];
  const el = document.createElement('button');
  document.body.appendChild(el);
  const controller = new GestureController({
    mode: 'stealth',
    longPressMs: 500,
    moveThresholdPx: 10,
    onActivate: (x, y, target) => activations.push({ x, y, target }),
    ...overrides,
  });
  controller.start();
  live.push(controller);
  return { controller, activations, el };
}

describe('GestureController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
  });
  afterEach(() => {
    // Detach every controller from the shared document so swallow-state can't
    // leak between tests.
    for (const c of live.splice(0)) c.stop();
    vi.useRealTimers();
  });

  it('toggle mode never activates on long-press', () => {
    const { activations, el } = setup({ mode: 'toggle' });
    dispatch(el, 'pointerdown');
    vi.advanceTimersByTime(600);
    expect(activations).toHaveLength(0);
  });

  it('activates after a touch long-press at the press coordinates', () => {
    const { activations, el } = setup();
    dispatch(el, 'pointerdown', { clientX: 30, clientY: 40 });
    vi.advanceTimersByTime(500);
    expect(activations).toHaveLength(1);
    expect(activations[0]).toMatchObject({ x: 30, y: 40, target: el });
  });

  it('cancels the long-press when the finger moves past the threshold (scroll intent)', () => {
    const { activations, el } = setup();
    dispatch(el, 'pointerdown', { clientX: 10, clientY: 20 });
    dispatch(el, 'pointermove', { clientX: 10, clientY: 45 }); // moved 25px > 10
    vi.advanceTimersByTime(600);
    expect(activations).toHaveLength(0);
  });

  it('cancels when the finger lifts before the timer (a tap, not a press)', () => {
    const { activations, el } = setup();
    dispatch(el, 'pointerdown');
    vi.advanceTimersByTime(200);
    dispatch(el, 'pointerup');
    vi.advanceTimersByTime(600);
    expect(activations).toHaveLength(0);
  });

  it('cancels when a second pointer joins (pinch / resting thumb)', () => {
    const { activations, el } = setup();
    dispatch(el, 'pointerdown', { pointerId: 1 });
    dispatch(el, 'pointerdown', { pointerId: 2 });
    vi.advanceTimersByTime(600);
    expect(activations).toHaveLength(0);
  });

  // Release-time activation (0.5.0): the press must stay open so movement can
  // become an Alt+drag marquee instead.
  it('activates a desktop Alt+click on RELEASE at the press coordinates', () => {
    const { activations, el } = setup();
    dispatch(el, 'pointerdown', { pointerType: 'mouse', altKey: true, clientX: 5, clientY: 6 });
    expect(activations).toHaveLength(0); // not yet — a drag may follow
    dispatch(el, 'pointerup', { pointerType: 'mouse', clientX: 5, clientY: 6 });
    expect(activations).toHaveLength(1);
    expect(activations[0]).toMatchObject({ x: 5, y: 6 });
  });

  it('ignores a plain desktop click with no modifier', () => {
    const { activations, el } = setup();
    dispatch(el, 'pointerdown', { pointerType: 'mouse', altKey: false });
    dispatch(el, 'pointerup', { pointerType: 'mouse' });
    vi.advanceTimersByTime(600);
    expect(activations).toHaveLength(0);
  });

  it('ignores Alt with a non-primary mouse button (right-click stays the host’s)', () => {
    const { activations, el } = setup();
    dispatch(el, 'pointerdown', { pointerType: 'mouse', altKey: true, button: 2 });
    dispatch(el, 'pointerup', { pointerType: 'mouse', button: 2 });
    expect(activations).toHaveLength(0);
  });

  it('swallows exactly the next click after activation, then lets clicks through', () => {
    const { el } = setup();
    dispatch(el, 'pointerdown', { pointerType: 'mouse', altKey: true });
    dispatch(el, 'pointerup', { pointerType: 'mouse' });
    const swallowed = dispatch(el, 'click', { pointerType: 'mouse' });
    expect(swallowed.defaultPrevented).toBe(true);
    const next = dispatch(el, 'click', { pointerType: 'mouse' });
    expect(next.defaultPrevented).toBe(false);
  });

  describe('Alt+drag area (0.5.0)', () => {
    function areaSetup(): ReturnType<typeof setup> & {
      changes: number[][];
      commits: number[][];
      cancels: number[];
    } {
      const changes: number[][] = [];
      const commits: number[][] = [];
      const cancels: number[] = [];
      const base = setup({
        onAreaChange: (x0, y0, x1, y1) => changes.push([x0, y0, x1, y1]),
        onAreaCommit: (x0, y0, x1, y1) => commits.push([x0, y0, x1, y1]),
        onAreaCancel: () => cancels.push(1),
      });
      return { ...base, changes, commits, cancels };
    }

    it('an Alt+press that travels past the threshold streams area changes and commits on release', () => {
      const { activations, changes, commits, el } = areaSetup();
      dispatch(el, 'pointerdown', { pointerType: 'mouse', altKey: true, clientX: 10, clientY: 10 });
      dispatch(el, 'pointermove', { pointerType: 'mouse', clientX: 60, clientY: 80 });
      expect(changes).toEqual([[10, 10, 60, 80]]);
      dispatch(el, 'pointerup', { pointerType: 'mouse', clientX: 60, clientY: 80 });
      expect(commits).toEqual([[10, 10, 60, 80]]);
      expect(activations).toHaveLength(0); // an area is not a point pin
    });

    it('the trailing click after an area commit is swallowed', () => {
      const { el } = areaSetup();
      dispatch(el, 'pointerdown', { pointerType: 'mouse', altKey: true, clientX: 10, clientY: 10 });
      dispatch(el, 'pointermove', { pointerType: 'mouse', clientX: 60, clientY: 80 });
      dispatch(el, 'pointerup', { pointerType: 'mouse', clientX: 60, clientY: 80 });
      const swallowed = dispatch(el, 'click', { pointerType: 'mouse' });
      expect(swallowed.defaultPrevented).toBe(true);
    });

    it('sub-threshold Alt movement stays a point activation, never an area', () => {
      const { activations, changes, commits, el } = areaSetup();
      dispatch(el, 'pointerdown', { pointerType: 'mouse', altKey: true, clientX: 10, clientY: 10 });
      dispatch(el, 'pointermove', { pointerType: 'mouse', clientX: 13, clientY: 12 });
      dispatch(el, 'pointerup', { pointerType: 'mouse', clientX: 13, clientY: 12 });
      expect(changes).toHaveLength(0);
      expect(commits).toHaveLength(0);
      expect(activations).toHaveLength(1);
    });

    it('pointercancel mid-drag cancels the area without committing', () => {
      const { cancels, commits, el } = areaSetup();
      dispatch(el, 'pointerdown', { pointerType: 'mouse', altKey: true, clientX: 10, clientY: 10 });
      dispatch(el, 'pointermove', { pointerType: 'mouse', clientX: 60, clientY: 80 });
      dispatch(el, 'pointercancel', { pointerType: 'mouse' });
      expect(cancels).toHaveLength(1);
      expect(commits).toHaveLength(0);
    });

    it('a second pointer joining mid-drag cancels the area', () => {
      const { cancels, commits, el } = areaSetup();
      dispatch(el, 'pointerdown', { pointerType: 'mouse', altKey: true, clientX: 10, clientY: 10 });
      dispatch(el, 'pointermove', { pointerType: 'mouse', clientX: 60, clientY: 80 });
      dispatch(el, 'pointerdown', { pointerId: 2 });
      expect(cancels).toHaveLength(1);
      expect(commits).toHaveLength(0);
    });

    it('touch movement past the threshold still cancels the long-press (scroll intent, no area)', () => {
      const { activations, changes, el } = areaSetup();
      dispatch(el, 'pointerdown', { clientX: 10, clientY: 20 });
      dispatch(el, 'pointermove', { clientX: 10, clientY: 45 });
      vi.advanceTimersByTime(600);
      expect(activations).toHaveLength(0);
      expect(changes).toHaveLength(0);
    });

    it('Escape mid-drag cancels the area; the release neither commits nor clicks the host', () => {
      const { activations, cancels, commits, el } = areaSetup();
      dispatch(el, 'pointerdown', { pointerType: 'mouse', altKey: true, clientX: 10, clientY: 10 });
      dispatch(el, 'pointermove', { pointerType: 'mouse', clientX: 60, clientY: 80 });
      dispatch(document, 'keydown', { key: 'Escape' });
      expect(cancels).toHaveLength(1);
      dispatch(el, 'pointerup', { pointerType: 'mouse', clientX: 60, clientY: 80 });
      expect(commits).toHaveLength(0);
      expect(activations).toHaveLength(0);
      const click = dispatch(el, 'click', { pointerType: 'mouse' });
      expect(click.defaultPrevented).toBe(true); // aborted gesture still shields the host
    });

    it('returning inside the threshold de-latches: cancel fires, release is a point again', () => {
      const { activations, cancels, commits, el } = areaSetup();
      dispatch(el, 'pointerdown', { pointerType: 'mouse', altKey: true, clientX: 10, clientY: 10 });
      dispatch(el, 'pointermove', { pointerType: 'mouse', clientX: 60, clientY: 80 });
      dispatch(el, 'pointermove', { pointerType: 'mouse', clientX: 12, clientY: 11 }); // back home
      expect(cancels).toHaveLength(1); // marquee visuals told to clear
      dispatch(el, 'pointerup', { pointerType: 'mouse', clientX: 12, clientY: 11 });
      expect(commits).toHaveLength(0); // never a 0x0 area
      expect(activations).toHaveLength(1); // reverts to a point pin
    });

    it('suspended() gates the whole controller: no press, no activation, no swallow', () => {
      const { activations, el } = setup({ suspended: () => true });
      dispatch(el, 'pointerdown', { pointerType: 'mouse', altKey: true });
      dispatch(el, 'pointerup', { pointerType: 'mouse' });
      expect(activations).toHaveLength(0);
      const click = dispatch(el, 'click', { pointerType: 'mouse' });
      expect(click.defaultPrevented).toBe(false); // no stray swallow armed
    });

    it('text selection and native drag are suppressed while a mouse press is in flight', () => {
      const { el } = areaSetup();
      dispatch(el, 'pointerdown', { pointerType: 'mouse', altKey: true, clientX: 10, clientY: 10 });
      const sel = dispatch(el, 'selectstart');
      const drag = dispatch(el, 'dragstart');
      expect(sel.defaultPrevented).toBe(true);
      expect(drag.defaultPrevented).toBe(true);
      dispatch(el, 'pointerup', { pointerType: 'mouse' });
      const selAfter = dispatch(el, 'selectstart');
      expect(selAfter.defaultPrevented).toBe(false); // press-scoped, not standing
    });

    it('the swallow intercepts BEFORE host document-capture listeners (window capture)', () => {
      const hostSeen = vi.fn();
      document.addEventListener('click', hostSeen, true); // host registered first
      try {
        const { el } = areaSetup();
        dispatch(el, 'pointerdown', {
          pointerType: 'mouse',
          altKey: true,
          clientX: 10,
          clientY: 10,
        });
        dispatch(el, 'pointermove', { pointerType: 'mouse', clientX: 60, clientY: 80 });
        dispatch(el, 'pointerup', { pointerType: 'mouse', clientX: 60, clientY: 80 });
        dispatch(el, 'click', { pointerType: 'mouse' });
        expect(hostSeen).not.toHaveBeenCalled();
      } finally {
        document.removeEventListener('click', hostSeen, true);
      }
    });

    it('stop() mid-drag cancels the area (no orphaned marquee visuals)', () => {
      const { controller, cancels, el } = areaSetup();
      dispatch(el, 'pointerdown', { pointerType: 'mouse', altKey: true, clientX: 10, clientY: 10 });
      dispatch(el, 'pointermove', { pointerType: 'mouse', clientX: 60, clientY: 80 });
      controller.stop();
      expect(cancels).toHaveLength(1);
    });
  });

  it('attaches the document pointermove listener only while a press is in flight (P2.4)', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const moveAdds = (): number => add.mock.calls.filter(([t]) => t === 'pointermove').length;
    const moveRemoves = (): number => remove.mock.calls.filter(([t]) => t === 'pointermove').length;
    try {
      const { activations, el } = setup();
      expect(moveAdds()).toBe(0); // idle stealth mode: no per-frame move handler

      dispatch(el, 'pointerdown');
      expect(moveAdds()).toBe(1);

      dispatch(el, 'pointerup');
      expect(moveRemoves()).toBeGreaterThanOrEqual(1);

      // Movement past the threshold still cancels a fresh press.
      dispatch(el, 'pointerdown', { clientX: 10, clientY: 20 });
      dispatch(el, 'pointermove', { clientX: 10, clientY: 45 });
      vi.advanceTimersByTime(600);
      expect(activations).toHaveLength(0);
    } finally {
      add.mockRestore();
      remove.mockRestore();
    }
  });

  it('stops listening after stop()', () => {
    const { controller, activations, el } = setup();
    controller.stop();
    dispatch(el, 'pointerdown');
    vi.advanceTimersByTime(600);
    expect(activations).toHaveLength(0);
  });
});
