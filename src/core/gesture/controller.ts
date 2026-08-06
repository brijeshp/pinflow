import type { ActivationConfig } from '../types';

export interface GestureControllerOptions {
  mode: NonNullable<ActivationConfig['mode']>;
  longPressMs: number;
  moveThresholdPx: number;
  onActivate: (x: number, y: number, target: Element) => void;
  /**
   * Alt+drag area callbacks (0.5.0). Once an Alt press travels past the
   * threshold it becomes an area drag: corners stream through `onAreaChange`,
   * the release commits via `onAreaCommit`, and `onAreaCancel` fires on
   * pointercancel / a second pointer / stop(). Without `onAreaCommit`,
   * movement cancels the press (the pre-area behavior).
   */
  onAreaChange?: (x0: number, y0: number, x1: number, y1: number) => void;
  onAreaCommit?: (x0: number, y0: number, x1: number, y1: number) => void;
  onAreaCancel?: () => void;
  /** While true, the controller ignores new presses entirely — the armed-mode
   *  handlers own all input (codex r1 [P2]: no parallel activation paths). */
  suspended?: () => boolean;
}

interface Press {
  pointerId: number;
  x: number;
  y: number;
  target: Element;
  touch: boolean;
  marquee: boolean;
}

// How long the post-activation click-swallow stays armed. A long-press that
// fires no trailing click (e.g. after pointercancel) must not eat a much later,
// genuine host click — so the flag self-clears.
const SWALLOW_WINDOW_MS = 700;

/**
 * Unified capture-phase pointer state machine for "stealth" activation.
 *
 * Touch: a 500ms long-press (cancelled by movement, lift, or a second finger)
 * drops a feedback point. Desktop: Alt+click drops a point on RELEASE; an
 * Alt+drag past the movement threshold draws an area instead — one grammar,
 * disambiguated by distance. The trailing synthetic `click` is swallowed
 * exactly once so the host page's own click handlers don't also fire.
 *
 * In `toggle` mode the controller is inert — the visible arm segment owns
 * activation instead.
 */
export class GestureController {
  private readonly _opts: GestureControllerOptions;
  private _press: Press | null = null;
  private _timer: ReturnType<typeof setTimeout> | undefined;
  private _swallowTimer: ReturnType<typeof setTimeout> | undefined;
  private _swallowNextClick = false;
  private _running = false;

  constructor(opts: GestureControllerOptions) {
    this._opts = opts;
  }

  start(): void {
    if (this._running || this._opts.mode === 'toggle') return;
    this._running = true;
    document.addEventListener('pointerdown', this._onPointerDown, true);
    document.addEventListener('pointerup', this._onPointerUp, true);
    document.addEventListener('pointercancel', this._onPointerCancel, true);
    // WINDOW capture, not document: window is the first stop on the
    // propagation path, so the swallow runs before any host document-capture
    // listener regardless of registration order (codex r1 [P1]).
    window.addEventListener('click', this._onClick, true);
    document.addEventListener('contextmenu', this._onContextMenu, true);
  }

  stop(): void {
    if (!this._running) return;
    this._running = false;
    this._cancelPress();
    this._swallowNextClick = false;
    clearTimeout(this._swallowTimer);
    document.removeEventListener('pointerdown', this._onPointerDown, true);
    document.removeEventListener('pointerup', this._onPointerUp, true);
    document.removeEventListener('pointercancel', this._onPointerCancel, true);
    window.removeEventListener('click', this._onClick, true);
    document.removeEventListener('contextmenu', this._onContextMenu, true);
  }

  // A cancelled press that was already an area drag must clean up the caller's
  // marquee visuals — cancel is the ONLY exit that fires onAreaCancel.
  private _cancelPress(): void {
    clearTimeout(this._timer);
    this._timer = undefined;
    if (this._press?.marquee) this._opts.onAreaCancel?.();
    this._press = null;
    document.removeEventListener('pointermove', this._onPointerMove, true);
    document.removeEventListener('keydown', this._onKeyDown, true);
    document.removeEventListener('selectstart', this._onKillDefault, true);
    document.removeEventListener('dragstart', this._onKillDefault, true);
  }

  // Escape aborts the press (marquee visuals included) and still shields the
  // host from the release's trailing click — the gesture was annotation
  // intent either way (codex r1 [P2]).
  private _onKeyDown = (e: Event): void => {
    if ((e as KeyboardEvent).key !== 'Escape') return;
    this._cancelPress();
    this._armSwallow();
  };

  // Mouse presses suppress text selection and native drag-and-drop for the
  // press duration — a marquee must never fight the browser's drag ghost or
  // leave a selection trail (codex r1 [P2]). Press-scoped: never at rest.
  private _onKillDefault = (e: Event): void => {
    e.preventDefault();
  };

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

    if (this._opts.suspended?.()) return;

    // A second active pointer means this is a multi-touch gesture, not a press.
    if (this._press) {
      this._cancelPress();
      return;
    }

    // Desktop: a primary-button Alt press opens a pending gesture — the
    // RELEASE decides point (still) vs area (dragged). Non-primary buttons
    // stay the host's (Alt+right-click must not hijack the context menu).
    if (pe.pointerType !== 'touch') {
      // `?? 0`: synthetic events without a button count as primary (the same
      // leniency as isPrimary elsewhere); a real right/middle press never does.
      if (!pe.altKey || (pe.button ?? 0) !== 0) return;
      this._press = {
        pointerId: pe.pointerId ?? 0,
        x: pe.clientX,
        y: pe.clientY,
        target,
        touch: false,
        marquee: false,
      };
      document.addEventListener('pointermove', this._onPointerMove, true);
      document.addEventListener('keydown', this._onKeyDown, true);
      document.addEventListener('selectstart', this._onKillDefault, true);
      document.addEventListener('dragstart', this._onKillDefault, true);
      return;
    }

    // Touch: begin a long-press. pointermove is only attached while a press is
    // in flight — stealth mode must not run a capture-phase move handler on
    // every host scroll/drag frame (P2.4).
    this._press = {
      pointerId: pe.pointerId,
      x: pe.clientX,
      y: pe.clientY,
      target,
      touch: true,
      marquee: false,
    };
    document.addEventListener('pointermove', this._onPointerMove, true);
    clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      // A press that started before arming must not fire into suspension —
      // the release path cancels it and shields its click (codex r3 [P2]).
      if (!this._press || this._opts.suspended?.()) return;
      const { x, y, target: t } = this._press;
      this._activate(x, y, t);
    }, this._opts.longPressMs);
  };

  private _onPointerMove = (e: Event): void => {
    const pe = e as PointerEvent;
    const p = this._press;
    if (!p || (pe.pointerId ?? 0) !== p.pointerId) return;
    // Armed mode can take over MID-press (keyboard-activated arm segment):
    // the in-flight gesture dies with it, and the swallow window shields the
    // eventual release's click from the armed handler (codex r2/r3 [P2]).
    if (this._opts.suspended?.()) {
      this._cancelPress();
      this._armSwallow();
      return;
    }
    if (p.touch) {
      // Movement is scroll intent — never an area on touch (a passive layer
      // cannot preventDefault native panning).
      if (Math.hypot(pe.clientX - p.x, pe.clientY - p.y) > this._opts.moveThresholdPx)
        this._cancelPress();
      return;
    }
    // Live threshold, both directions: returning inside it DE-LATCHES the
    // marquee (release reverts to a point pin — never a 0×0 area, codex r1 [P2]).
    if (Math.hypot(pe.clientX - p.x, pe.clientY - p.y) <= this._opts.moveThresholdPx) {
      if (p.marquee) {
        p.marquee = false;
        this._opts.onAreaCancel?.();
      }
      return;
    }
    if (!this._opts.onAreaCommit) {
      this._cancelPress(); // no area consumer: movement cancels, as before
      return;
    }
    p.marquee = true;
    this._opts.onAreaChange?.(p.x, p.y, pe.clientX, pe.clientY);
  };

  private _onPointerUp = (e: Event): void => {
    const pe = e as PointerEvent;
    const p = this._press;
    if (!p || (pe.pointerId ?? 0) !== p.pointerId) return;
    if (p.touch) {
      this._cancelPress(); // a tap; the long-press timer owns touch activation
      return;
    }
    if (this._opts.suspended?.()) {
      this._cancelPress();
      this._armSwallow();
      return;
    }
    // The RELEASE coordinates are authoritative in BOTH directions (codex
    // r2/r3 [P2]): a coalesced return-to-origin must not commit a degenerate
    // area, and a coalesced far release must not degrade to a point — the
    // latched flag only tracks whether marquee VISUALS need cancelling.
    this._press = null;
    this._cancelPress();
    if (
      this._opts.onAreaCommit &&
      Math.hypot(pe.clientX - p.x, pe.clientY - p.y) > this._opts.moveThresholdPx
    ) {
      this._armSwallow();
      this._opts.onAreaCommit(p.x, p.y, pe.clientX, pe.clientY);
      return;
    }
    if (p.marquee) this._opts.onAreaCancel?.(); // latched visuals degrade with it
    this._activate(p.x, p.y, p.target); // Alt+click: point pin on release
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
