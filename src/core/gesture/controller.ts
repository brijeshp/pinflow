import { acquireSelectionGuard } from '../ui/selection-guard';
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
   *  handlers own all input (review r1 [P2]: no parallel activation paths). */
  suspended?: () => boolean;
}

interface Press {
  pointerId: number;
  x: number;
  y: number;
  target: Element;
  touch: boolean;
  marquee: boolean;
  /** Touch/pen only: the long-press threshold fired and claimed the gesture
   *  from the scroller (0.5.x hold-then-drag). From here movement draws the
   *  marquee and the RELEASE disambiguates point vs area, exactly like
   *  desktop Alt — near stays a point pin, far commits the drawn area. */
  held: boolean;
}

// How long the post-activation click-swallow stays armed. A long-press that
// fires no trailing click (e.g. after pointercancel) must not eat a much later,
// genuine host click — so the flag self-clears.
const SWALLOW_WINDOW_MS = 700;

// Upper bound on a release shield. While one is outstanding the shielded
// pointer is presumed still down, so a second pointer is multi-touch and is
// ignored — that guard is why an intruder cannot steal the shielding. But the
// release it waits for may never arrive (released outside the window, browser
// UI interruption), and touch and pen mint a fresh id per contact, so nothing
// else would ever clear it: the gesture layer stayed blocked for the life of
// the page. Long enough to cover any real hold, short enough to be a hiccup.
const SHIELD_MAX_MS = 10_000;

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
  private _releaseSel: (() => void) | undefined;
  /**
   * A retired press whose RELEASE must still be swallowed — armed mode took
   * over mid-press, or Escape aborted it. Held as a bare pointerId rather than
   * a `dead` press in the slot above, because the slot gates every new gesture:
   * a dead press waiting for a release that never came (touch and pen mint a
   * fresh id per contact, so the same-id recovery could not fire) blocked the
   * gesture layer permanently and left the page's selection and context menu
   * suppressed with it. A shield must outlive its press without owning the slot.
   */
  private _shield: number | null = null;
  private _shieldTimer: ReturnType<typeof setTimeout> | undefined;
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
    // listener regardless of registration order (review r1 [P1]).
    window.addEventListener('click', this._onClick, true);
    // Touch's compatibility mouse events are NOT suppressed by cancelling the
    // pointer event — the spec routes that through touchstart, which a passive
    // annotation layer must not claim. So they are swallowed here alongside the
    // click, or every long-press also reached the host's mousedown/mouseup
    // handlers: canvas surfaces, drag targets and :active widgets all reacted.
    window.addEventListener('mousedown', this._onClick, true);
    window.addEventListener('mouseup', this._onClick, true);
    document.addEventListener('contextmenu', this._onContextMenu, true);
  }

  /** Armed mode is taking over NOW: kill any in-flight press synchronously.
   *  It goes dead — visuals cancel, the timer stops — but ownership is
   *  retained so its eventual release stays shielded even if armed mode has
   *  already toggled off again by then (review r7 [P2]). Unprefixed: crosses
   *  the module boundary at runtime (mangling contract). */
  suspendPress(): void {
    if (this._press) this._killPress(this._press);
  }

  stop(): void {
    if (!this._running) return;
    this._running = false;
    this._cancelPress();
    this._dropShield();
    this._swallowNextClick = false;
    clearTimeout(this._swallowTimer);
    document.removeEventListener('pointerdown', this._onPointerDown, true);
    document.removeEventListener('pointerup', this._onPointerUp, true);
    document.removeEventListener('pointercancel', this._onPointerCancel, true);
    window.removeEventListener('click', this._onClick, true);
    window.removeEventListener('mousedown', this._onClick, true);
    window.removeEventListener('mouseup', this._onClick, true);
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
    document.removeEventListener('touchmove', this._onTouchMove, true);
    this._releaseSel?.();
    this._releaseSel = undefined;
  }

  // Escape aborts the press (marquee visuals included) but RETAINS ownership:
  // the press goes dead and the matching release arms the click-swallow — a
  // window started here would expire under a >700ms hold (review r1/r5 [P2]).
  private _onKeyDown = (e: Event): void => {
    if ((e as KeyboardEvent).key !== 'Escape') return;
    if (this._press) this._killPress(this._press);
  };

  // Mouse presses suppress text selection and native drag-and-drop for the
  // press duration — a marquee must never fight the browser's drag ghost or
  // leave a selection trail (review r1 [P2]). Press-scoped: never at rest.
  private _onKillDefault = (e: Event): void => {
    e.preventDefault();
  };

  // Registered non-passive at hold-fire, never earlier: before the hold, a
  // moving finger is a scroll and must stay native. After it, the finger held
  // still through the threshold, so no scroll is in flight — preventing the
  // first touchmove keeps the scroller from ever claiming the drag. A killed
  // press leaves the slot entirely (shield design), so `held` alone gates.
  private _onTouchMove = (e: Event): void => {
    if (this._press?.held) e.preventDefault();
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

    // The SAME pointer pressing again proves the previous release was lost (an
    // outside-window release delivers no pointerup — documented behavior), for
    // a shielded press as much as a live one: drop the shield and let this down
    // open a fresh gesture, so the first retry is never eaten (review r8/ce #5).
    // A DIFFERENT pointer still cancels a live press (pinch), but no longer
    // meets a retired one — a shield does not occupy the slot (review r6 [P2]).
    if (this._shield !== null) {
      if ((pe.pointerId ?? 0) !== this._shield) return; // multi-touch, not a press
      this._dropShield();
    }
    if (this._press) {
      if ((pe.pointerId ?? 0) !== this._press.pointerId) {
        this._cancelPress(); // a second live pointer is a pinch, not a press
        return;
      }
      this._cancelPress(); // stale same-pointer press: marquee visuals cancel if latched
    }

    // Desktop MOUSE: a primary-button Alt press opens a pending gesture — the
    // RELEASE decides point (still) vs area (dragged). Non-primary buttons
    // stay the host's (Alt+right-click must not hijack the context menu).
    //
    // Pen goes with touch, not here. Apple Pencil and the Surface pen report
    // pointerType 'pen', and this branch demands an Alt key the hand holding a
    // stylus does not have — so stealth mode, which has no visible dock to fall
    // back on, was entirely unusable with a pen.
    if (pe.pointerType !== 'touch' && pe.pointerType !== 'pen') {
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
        held: false,
      };
      document.addEventListener('pointermove', this._onPointerMove, true);
      document.addEventListener('keydown', this._onKeyDown, true);
      document.addEventListener('selectstart', this._onKillDefault, true);
      document.addEventListener('dragstart', this._onKillDefault, true);
      return;
    }

    // Touch and pen: begin a long-press. pointermove is only attached while a
    // press is in flight — stealth mode must not run a capture-phase move
    // handler on every host scroll/drag frame (P2.4).
    //
    // The selection guard goes up with the press: WebKit's own long-press
    // timer starts text selection + the Copy/Search callout on the SAME
    // gesture, and `selectstart` is ignored there — CSS applied at
    // finger-down is the only thing that reliably beats it (0.5.x).
    this._releaseSel = acquireSelectionGuard();
    this._press = {
      pointerId: pe.pointerId,
      x: pe.clientX,
      y: pe.clientY,
      target,
      touch: true,
      marquee: false,
      held: false,
    };
    document.addEventListener('pointermove', this._onPointerMove, true);
    document.addEventListener('keydown', this._onKeyDown, true);
    clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      const pr = this._press;
      if (!pr) return;
      // A press that started before arming must not fire into suspension —
      // it dies in place and its release is shielded (review r3/r4 [P2]).
      if (this._opts.suspended?.()) {
        this._killPress(pr);
        return;
      }
      // Hold-then-drag (0.5.x): with an area consumer, the hold CLAIMS the
      // gesture instead of activating. The finger held still through the
      // threshold, so no scroll is in flight — a non-passive touchmove keeps
      // the scroller from taking it, and the zero-size marquee dim is the
      // "you have it" cue. The RELEASE disambiguates point vs area, exactly
      // like desktop Alt.
      if (this._opts.onAreaCommit) {
        pr.held = true;
        pr.marquee = true;
        document.addEventListener('touchmove', this._onTouchMove, {
          capture: true,
          passive: false,
        });
        this._opts.onAreaChange?.(pr.x, pr.y, pr.x, pr.y);
        return;
      }
      // No area consumer — legacy timer-fire activation. NOT _activate():
      // that retires the press, and the finger is still down. The
      // compatibility click arrives at LIFT, so a swallow window opened here
      // is spent during the hold — past ~1.2s the host page received the
      // click under the reviewer's finger. Retiring to the shield hands the
      // release to _onPointerUp, which re-arms the swallow at the moment the
      // click is actually coming.
      this._killPress(pr);
      this._armSwallow();
      this._opts.onActivate(pr.x, pr.y, pr.target);
    }, this._opts.longPressMs);
  };

  // Armed mode can take over MID-press (keyboard-activated arm segment): the
  // press goes DEAD — visuals cancel and the timer stops — but ownership is
  // retained so the matching release arms the click-swallow AT release time; a
  // window started at cancellation would expire under a long hold (review r4).
  private _killPress(p: Press): void {
    this._shield = p.pointerId;
    clearTimeout(this._shieldTimer);
    this._shieldTimer = setTimeout(() => this._dropShield(), SHIELD_MAX_MS);
    this._cancelPress(); // clears the timer, the listeners and any marquee visuals
  }

  private _dropShield(): void {
    this._shield = null;
    clearTimeout(this._shieldTimer);
  }

  private _onPointerMove = (e: Event): void => {
    const pe = e as PointerEvent;
    const p = this._press;
    if (!p || (pe.pointerId ?? 0) !== p.pointerId) return;
    if (this._opts.suspended?.()) {
      this._killPress(p);
      return;
    }
    if (p.touch) {
      if (p.held) {
        // The hold already claimed the gesture — movement draws. No de-latch:
        // the dim IS the held cue, and the release decides point vs area.
        this._opts.onAreaChange?.(p.x, p.y, pe.clientX, pe.clientY);
        return;
      }
      // Pre-hold movement is scroll intent — the platform owns it (the
      // touchmove claim only exists once the hold fires).
      if (Math.hypot(pe.clientX - p.x, pe.clientY - p.y) > this._opts.moveThresholdPx)
        this._cancelPress();
      return;
    }
    // Live threshold, both directions: returning inside it DE-LATCHES the
    // marquee (release reverts to a point pin — never a 0×0 area, review r1 [P2]).
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
    const id = pe.pointerId ?? 0;
    // A shielded release is the whole reason the shield exists: swallow its
    // compatibility click, armed HERE rather than when the press was retired,
    // since a window opened then would expire under a long hold (review r4).
    if (this._shield === id) {
      this._dropShield();
      this._armSwallow();
      return;
    }
    const p = this._press;
    if (!p || id !== p.pointerId) return;
    if (this._opts.suspended?.()) {
      // No shield: the press is releasing right now, so there is nothing left
      // to wait for — arming one here only to drop it again is churn.
      this._cancelPress();
      this._armSwallow();
      return;
    }
    if (p.touch) {
      if (!p.held) {
        this._cancelPress(); // a tap; the long-press timer owns touch activation
        return;
      }
      // Held release: same disambiguation as desktop Alt below. Clear the
      // slot BEFORE cancelling so the marquee cancel doesn't auto-fire — the
      // commit replaces the visuals, and the point path drops them explicitly.
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
      this._opts.onAreaCancel?.(); // the zero-size cue drops; this was a point
      this._activate(p.x, p.y, p.target);
      return;
    }
    // The RELEASE coordinates are authoritative in BOTH directions (review
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

  private _onPointerCancel = (e: Event): void => {
    // Only the press's OWN pointer cancels it — an unrelated pointer's cancel
    // must not kill a live press or a shielded release (review r6 [P2]). No
    // compatibility click follows a cancel, so no swallow either way.
    const id = (e as PointerEvent).pointerId ?? 0;
    if (this._shield === id) {
      this._dropShield();
      return;
    }
    const p = this._press;
    if (!p || id !== p.pointerId) return;
    this._cancelPress();
  };

  // One handler for the whole compatibility burst (mousedown → mouseup →
  // click). Only the CLICK consumes the one-shot flag: the other two arrive
  // before it and must leave it armed, or the click itself would slip through.
  private _onClick = (e: Event): void => {
    if (!this._swallowNextClick) return;
    if (e.type === 'click') {
      this._swallowNextClick = false;
      clearTimeout(this._swallowTimer);
    }
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  private _onContextMenu = (e: Event): void => {
    // Suppress the native long-press callout/menu while a press is in flight or
    // just activated, without hijacking right-click the rest of the time.
    if (this._press || this._swallowNextClick) e.preventDefault();
  };
}
