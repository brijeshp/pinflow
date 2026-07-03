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
  private readonly _opts: GestureControllerOptions;
  private readonly _doc: Document;
  private _press: Press | null = null;
  private _timer: ReturnType<typeof setTimeout> | undefined;
  private _swallowTimer: ReturnType<typeof setTimeout> | undefined;
  private _swallowNextClick = false;
  private _running = false;

  constructor(opts: GestureControllerOptions) {
    this._opts = opts;
    this._doc = opts.doc ?? document;
  }

  start(): void {
    if (this._running || this._opts.mode === 'toggle') return;
    this._running = true;
    this._doc.addEventListener('pointerdown', this._onPointerDown, true);
    this._doc.addEventListener('pointermove', this._onPointerMove, true);
    this._doc.addEventListener('pointerup', this._onPointerUp, true);
    this._doc.addEventListener('pointercancel', this._onPointerCancel, true);
    this._doc.addEventListener('click', this._onClick, true);
    this._doc.addEventListener('contextmenu', this._onContextMenu, true);
  }

  stop(): void {
    if (!this._running) return;
    this._running = false;
    this._cancelPress();
    this._swallowNextClick = false;
    clearTimeout(this._swallowTimer);
    this._doc.removeEventListener('pointerdown', this._onPointerDown, true);
    this._doc.removeEventListener('pointermove', this._onPointerMove, true);
    this._doc.removeEventListener('pointerup', this._onPointerUp, true);
    this._doc.removeEventListener('pointercancel', this._onPointerCancel, true);
    this._doc.removeEventListener('click', this._onClick, true);
    this._doc.removeEventListener('contextmenu', this._onContextMenu, true);
  }

  private _cancelPress(): void {
    clearTimeout(this._timer);
    this._timer = undefined;
    this._press = null;
  }

  private _armSwallow(): void {
    this._swallowNextClick = true;
    clearTimeout(this._swallowTimer);
    this._swallowTimer = setTimeout(() => {
      this._swallowNextClick = false;
    }, SWALLOW_WINDOW_MS);
  }

  private _activate(x: number, y: number, target: Element): void {
    this._cancelPress();
    this._armSwallow();
    this._opts.onActivate(x, y, target);
  }

  private _onPointerDown = (e: Event): void => {
    const pe = e as PointerEvent;
    const target = e.target as Element | null;
    if (!target) return;

    // A second active pointer means this is a multi-touch gesture, not a press.
    if (this._press) {
      this._cancelPress();
      return;
    }

    // Desktop: Alt+click activates immediately.
    if (pe.pointerType !== 'touch') {
      if (pe.altKey) this._activate(pe.clientX, pe.clientY, target);
      return;
    }

    // Touch: begin a long-press.
    this._press = { pointerId: pe.pointerId, x: pe.clientX, y: pe.clientY, target };
    clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      if (!this._press) return;
      const { x, y, target: t } = this._press;
      this._activate(x, y, t);
    }, this._opts.longPressMs);
  };

  private _onPointerMove = (e: Event): void => {
    const pe = e as PointerEvent;
    if (!this._press || pe.pointerId !== this._press.pointerId) return;
    const dist = Math.hypot(pe.clientX - this._press.x, pe.clientY - this._press.y);
    if (dist > this._opts.moveThresholdPx) this._cancelPress();
  };

  private _onPointerUp = (e: Event): void => {
    const pe = e as PointerEvent;
    if (this._press && pe.pointerId === this._press.pointerId) this._cancelPress();
  };

  private _onPointerCancel = (): void => {
    if (this._press) this._cancelPress();
  };

  private _onClick = (e: Event): void => {
    if (!this._swallowNextClick) return;
    this._swallowNextClick = false;
    clearTimeout(this._swallowTimer);
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  private _onContextMenu = (e: Event): void => {
    // Suppress the native long-press callout/menu while a press is in flight or
    // just activated, without hijacking right-click the rest of the time.
    if (this._press || this._swallowNextClick) e.preventDefault();
  };
}
