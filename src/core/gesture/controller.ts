import type { ActivationConfig } from '../types';

export interface GestureControllerOptions {
  mode: NonNullable<ActivationConfig['mode']>;
  longPressMs: number;
  moveThresholdPx: number;
  onActivate: (x: number, y: number, target: Element) => void;
  /** Injectable for tests; defaults to the global document. */
  doc?: Document;
}

interface Press {
  pointerId: number;
  x: number;
  y: number;
  target: Element;
}

// How long the post-activation click-swallow stays armed. A long-press that
// fires no trailing click (e.g. after pointercancel) must not eat a much later,
// genuine host click — so the flag self-clears.
const SWALLOW_WINDOW_MS = 700;

/**
 * Unified capture-phase pointer state machine for "stealth" activation.
 *
 * Touch: a 500ms long-press (cancelled by movement, lift, or a second finger)
 * drops a feedback point. Desktop: Alt+click. The trailing synthetic `click` is
 * swallowed exactly once so the host page's own click handlers don't also fire.
 *
 * In `toggle` mode the controller is inert — the visible v1 control button owns
 * activation instead.
 */
export class GestureController {
  private readonly opts: GestureControllerOptions;
  private readonly doc: Document;
  private press: Press | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private swallowTimer: ReturnType<typeof setTimeout> | undefined;
  private swallowNextClick = false;
  private running = false;

  constructor(opts: GestureControllerOptions) {
    this.opts = opts;
    this.doc = opts.doc ?? document;
  }

  start(): void {
    if (this.running || this.opts.mode === 'toggle') return;
    this.running = true;
    this.doc.addEventListener('pointerdown', this.onPointerDown, true);
    this.doc.addEventListener('pointermove', this.onPointerMove, true);
    this.doc.addEventListener('pointerup', this.onPointerUp, true);
    this.doc.addEventListener('pointercancel', this.onPointerCancel, true);
    this.doc.addEventListener('click', this.onClick, true);
    this.doc.addEventListener('contextmenu', this.onContextMenu, true);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.cancelPress();
    this.swallowNextClick = false;
    clearTimeout(this.swallowTimer);
    this.doc.removeEventListener('pointerdown', this.onPointerDown, true);
    this.doc.removeEventListener('pointermove', this.onPointerMove, true);
    this.doc.removeEventListener('pointerup', this.onPointerUp, true);
    this.doc.removeEventListener('pointercancel', this.onPointerCancel, true);
    this.doc.removeEventListener('click', this.onClick, true);
    this.doc.removeEventListener('contextmenu', this.onContextMenu, true);
  }

  private cancelPress(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.press = null;
  }

  private armSwallow(): void {
    this.swallowNextClick = true;
    clearTimeout(this.swallowTimer);
    this.swallowTimer = setTimeout(() => {
      this.swallowNextClick = false;
    }, SWALLOW_WINDOW_MS);
  }

  private activate(x: number, y: number, target: Element): void {
    this.cancelPress();
    this.armSwallow();
    this.opts.onActivate(x, y, target);
  }

  private onPointerDown = (e: Event): void => {
    const pe = e as PointerEvent;
    const target = e.target as Element | null;
    if (!target) return;

    // A second active pointer means this is a multi-touch gesture, not a press.
    if (this.press) {
      this.cancelPress();
      return;
    }

    // Desktop: Alt+click activates immediately.
    if (pe.pointerType !== 'touch') {
      if (pe.altKey) this.activate(pe.clientX, pe.clientY, target);
      return;
    }

    // Touch: begin a long-press.
    this.press = { pointerId: pe.pointerId, x: pe.clientX, y: pe.clientY, target };
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (!this.press) return;
      const { x, y, target: t } = this.press;
      this.activate(x, y, t);
    }, this.opts.longPressMs);
  };

  private onPointerMove = (e: Event): void => {
    const pe = e as PointerEvent;
    if (!this.press || pe.pointerId !== this.press.pointerId) return;
    const dist = Math.hypot(pe.clientX - this.press.x, pe.clientY - this.press.y);
    if (dist > this.opts.moveThresholdPx) this.cancelPress();
  };

  private onPointerUp = (e: Event): void => {
    const pe = e as PointerEvent;
    if (this.press && pe.pointerId === this.press.pointerId) this.cancelPress();
  };

  private onPointerCancel = (): void => {
    if (this.press) this.cancelPress();
  };

  private onClick = (e: Event): void => {
    if (!this.swallowNextClick) return;
    this.swallowNextClick = false;
    clearTimeout(this.swallowTimer);
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  private onContextMenu = (e: Event): void => {
    // Suppress the native long-press callout/menu while a press is in flight or
    // just activated, without hijacking right-click the rest of the time.
    if (this.press || this.swallowNextClick) e.preventDefault();
  };
}
