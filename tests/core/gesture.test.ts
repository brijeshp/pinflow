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

  it('activates immediately on desktop Alt+click', () => {
    const { activations, el } = setup();
    dispatch(el, 'pointerdown', { pointerType: 'mouse', altKey: true, clientX: 5, clientY: 6 });
    expect(activations).toHaveLength(1);
    expect(activations[0]).toMatchObject({ x: 5, y: 6 });
  });

  it('ignores a plain desktop click with no modifier', () => {
    const { activations, el } = setup();
    dispatch(el, 'pointerdown', { pointerType: 'mouse', altKey: false });
    vi.advanceTimersByTime(600);
    expect(activations).toHaveLength(0);
  });

  it('swallows exactly the next click after activation, then lets clicks through', () => {
    const { el } = setup();
    dispatch(el, 'pointerdown', { pointerType: 'mouse', altKey: true });
    const swallowed = dispatch(el, 'click', { pointerType: 'mouse' });
    expect(swallowed.defaultPrevented).toBe(true);
    const next = dispatch(el, 'click', { pointerType: 'mouse' });
    expect(next.defaultPrevented).toBe(false);
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
