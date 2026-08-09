import { anchorTarget, anchorToScreen, buildAnchor, resolveAnchor } from '../anchor';
import { buildSelectors } from '../selector';
import { copyToClipboard, download } from '../download';
import {
  exportBuilder,
  exportFilename,
  exportJSON as exportStoresJSON,
  exportReviewer,
} from '../export';
import { createId } from '../id';
import { now } from '../time';
import { routeKey } from '../route-key';
import {
  clearProject,
  deleteComment as deleteCommentFromStore,
  emptyStore,
  loadAllStores,
  loadStore,
  mergeComments,
  normalizeComments,
  saveStore,
  upsertComment,
} from '../storage';
import type {
  ActivationConfig,
  Anchor,
  AreaPercent,
  Comment,
  Mode,
  PinflowConfig,
  ReviewerStore,
  VoiceMeta,
} from '../types';
import { GestureController } from '../gesture/controller';
import type { Logger, VoiceHost, VoiceModule, VoiceSession } from '../voice-contract';
import { loadVoice as defaultLoadVoice } from '../voice-loader';
import { contrastFor, createUIRoot, el, flipPosition, place, type UIRoot } from './dom';

// Not publicly configurable (P4.4): the 500ms default matched every real use.
// GestureController keeps its internal option for tests.
const LONG_PRESS_MS = 500;
const MOVE_THRESHOLD_PX = 10;

// Dispositioned by the team (via hydration) — a shared record, not the
// reviewer's draft: frozen in the UI (no edit/delete, exempt from
// empty-cleanup). `open` is NOT resolved; it stays fully editable.
function isResolved(c: Comment): boolean {
  return c.status === 'done' || c.status === 'declined';
}

interface AnnotatorDeps {
  config: Required<Pick<PinflowConfig, 'project'>> & PinflowConfig;
  /** null = stealth mode with identity deferred to the first activation. */
  reviewer: string | null;
  mode: Mode;
  storage: Storage;
  /** Resolves (and may prompt for) the reviewer identity at first activation. */
  resolveIdentity?: () => string | null;
  /** Injectable for tests; defaults to the real lazy `import('@brijeshp/pinflow/voice')`. */
  loadVoice?: () => Promise<VoiceModule>;
}

interface ActiveVoice {
  mount: HTMLDivElement;
  session: VoiceSession | null;
  /** Aborts in-flight startup (token/socket/mic) on teardown — codex #4. */
  abort: AbortController;
}

interface ActiveInput {
  wrap: HTMLDivElement;
  commentId: string;
  /** Detach the popup's document-level dismiss listeners. */
  cleanup(): void;
  /** Persist the draft's current text and close (frozen popups just close).
   *  Lets export surfaces resolve an open draft LOSSLESSLY before acting. */
  save(): void;
}

export class Annotator {
  private readonly _ui: UIRoot;
  private readonly _deps: AnnotatorDeps;
  // Host-defined logical screen key (config.routeKey) or the URL default —
  // the seam that makes frame-per-screen hosts (wizards, phased experiences
  // on one URL) work: pins anchor to and show on the host's notion of a
  // screen, and refreshRoute() re-evaluates it.
  private readonly _routeKey: () => string;
  private _reviewer: string | null;
  private _store: ReviewerStore;
  private _annotating = false;
  private _pins = new Map<string, HTMLButtonElement>();
  // Marching-ants footprints for area comments (one per visible area comment,
  // keyed like _pins): the drawn region stays visible on the page, muted for
  // dispositioned comments, hidden with orphans. pointer-events:none — the
  // host page is never occluded interactively.
  private _areas = new Map<string, HTMLDivElement>();
  // Reflow-path caches (P2.1/P2.2): repositioning runs at up to 60fps, so it
  // must never re-scan localStorage or re-run the selector ladder per frame.
  // Both are dropped whenever data or route changes (persist / renderPins).
  private _visibleCache: Array<Comment & { reviewer?: string }> | null = null;
  private readonly _anchorCache = new Map<string, Element | null>();
  private _activeInput: ActiveInput | null = null;
  // Bottom-left dock (0.5.0): THE one standing affordance. Reviewer gets an
  // arm segment (+/× toggle) unless stealth; the count chip joins it when
  // there is something to export (builder: the chip toggles the drawer).
  private _dockEl: HTMLDivElement | null = null;
  private _armEl: HTMLButtonElement | null = null;
  private _panelEl: HTMLDivElement | null = null;
  // Anytime-export affordance: the count chip, whichever element anchors the
  // open panel (control in toggle mode, chip for the export sheet), which KIND
  // of panel is up (a sheet summon must replace a menu/confirmation, not just
  // toggle it away — codex #4), and the sheet's outside-dismiss teardown.
  private _chipEl: HTMLButtonElement | null = null;
  private _panelAnchor: HTMLElement | null = null;
  private _panelKind: 'menu' | 'sheet' | 'confirm' | null = null;
  private _sheetDismiss: (() => void) | null = null;
  /** Host page's body cursor, saved on entering annotate mode and restored on exit. */
  private _prevBodyCursor = '';
  // Armed-mode hover outline: a non-interactive accent box over the element
  // under the cursor, rendered inside the shadow root — host styles/classes
  // are never touched. The move listener exists ONLY while armed (P2 posture:
  // no capture-phase move handler at rest, mirroring the gesture controller's
  // press scoping). The same element doubles as the marquee box while dragging.
  private _hoverEl: HTMLDivElement | null = null;
  private _hoverTarget: Element | null = null;
  private _hoverFrame = 0;
  // Drag-to-marquee (armed mode, mouse/pen only): press origin + latest
  // corner; `live` flips once the press travels past MOVE_THRESHOLD_PX —
  // below it the press stays a plain click and the click handler places a
  // point pin. The marquee is a PICKER: release resolves the tightest
  // containing element and drops a normal element-anchored comment carrying
  // `areaPercent`. Listeners share the armed window (P2: zero work at rest).
  private _marquee: {
    id: number;
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    live: boolean;
    /** A second pointer joined: the whole gesture is dead, including the
     *  initiating pointer's eventual compatibility click. */
    aborted: boolean;
    /** Ids of pointers still down on an aborted marquee — ONLY participants
     *  retire members (a pre-existing bystander pointer must not skew the
     *  accounting, codex r5); each participant's release swallows its own
     *  compatibility click, and the state clears when the last one lifts. */
    pending: number[];
  } | null = null;
  private _reflowFrame = 0;
  private _orphanRetryAt = 0;
  // Builder-mode reviewer filter: unchecked reviewers' pins hide (codex #14).
  private readonly _builderHidden = new Set<string>();
  private _gesture: GestureController | null = null;
  // Bumped on every teardown (destroy/route change) so in-flight async voice
  // work resolving into a stale world can detect it and self-cancel.
  private _generation = 0;
  // Set once destroy() finishes tearing down: from then on the annotator must
  // never write to storage or touch the DOM, no matter what resolves late.
  private _destroyed = false;
  private _activeVoice: ActiveVoice | null = null;
  // Deletion tombstones for the window where a source() hydration is in
  // flight: a snapshot fetched BEFORE a delete must not resurrect the
  // deleted comment when it resolves AFTER it (codex 0.3.0 P1) — and a
  // resurrected copy would even re-announce as an 'add' on the next
  // reconcile, restoring it server-side.
  private _pendingDeletes: Set<string> | null = null;
  private readonly _voiceLogger: Logger = {
    warn: (m, d) => console.warn(`[pinflow] ${m}`, d),
    error: (m, d) => console.error(`[pinflow] ${m}`, d),
  };

  constructor(deps: AnnotatorDeps) {
    this._deps = deps;
    this._routeKey = deps.config.routeKey ?? routeKey;
    this._ui = createUIRoot();
    this._applyTheme();
    this._reviewer = deps.reviewer;
    // Deferred-identity (stealth) starts with an inert placeholder store; the
    // real corpus is loaded once _ensureIdentity resolves a name.
    this._store =
      deps.reviewer !== null
        ? (loadStore(deps.storage, deps.config.project, deps.reviewer) ??
          emptyStore(deps.config.project, deps.reviewer))
        : emptyStore(deps.config.project, '');
    this._renderDock();
    this._renderPins();
    this._startGesture();
    this._hydrateFromSource();
    window.addEventListener('resize', this._onReflow);
    // Capture phase: scroll events on nested overflow containers do NOT
    // bubble, but they DO capture through document — without this, pins over
    // inner scrollareas keep stale fixed coordinates (codex audit #6).
    document.addEventListener('scroll', this._onReflow, { passive: true, capture: true });
    // Desktop accelerator for the export sheet. A chord, so it can never
    // collide with typing in host inputs; gated at registration (config is
    // immutable per instance).
    if (this._exportUiEnabled()) document.addEventListener('keydown', this._onExportHotkey, true);
  }

  /** Boot-line datum: comment count of the (synchronously loaded) local store. */
  get _count(): number {
    return this._store.comments.length;
  }

  private _onExportHotkey = (e: Event): void => {
    const k = e as KeyboardEvent;
    if (k.repeat) return; // held chord must not strobe the sheet
    if (!(k.metaKey || k.ctrlKey) || !k.shiftKey || k.key.toLowerCase() !== 'e') return;
    // The chord stays the HOST'S unless pinflow will actually act (codex #11):
    // an open sheet toggles closed; otherwise there must be something to export.
    if (this._panelKind !== 'sheet' && this._store.comments.length === 0) return;
    k.preventDefault();
    this._toggleSheet();
  };

  // L2.1: the read half of the sync protocol, fetched once per resolved
  // identity — i.e. wherever the store becomes real: the constructor when the
  // reviewer is known at init, or _ensureIdentity when stealth's deferred
  // identity resolves. Reviewer mode only (`source` is scoped to the current
  // reviewer; builder-mode all-reviewer hydration is a later slice).
  // Generation + destroyed guards follow _startVoiceDot: a fetch resolving
  // after destroy()/refreshRoute() must not write into the stale world.
  // Hydration-APPLIED changes never echo into onChange (they're the host's
  // own data coming back). The one exception is reconciliation: a local
  // comment ABSENT from the server list either never synced (transient write
  // failure) or predates sync — re-announce it as an 'add' so the host's
  // write pipe repairs the gap (idempotent: PROTOCOL upserts by id).
  private _hydrateFromSource(): void {
    const source = this._deps.config.source;
    if (!source || this._deps.mode !== 'reviewer' || this._reviewer === null) return;
    // Guarded by destruction and IDENTITY, not the route generation: a SPA
    // navigating during a slow fetch must still receive its server comments
    // (codex audit #3). Route changes only re-render; they don't invalidate
    // the corpus the fetch belongs to.
    const forReviewer = this._reviewer;
    // The host callback is called synchronously (tests and hosts may hand
    // out the resolver immediately) but a synchronous THROW is contained the
    // same as a rejection, and the payload is normalized like any untrusted
    // blob — a non-array or malformed entries never reach merge (codex #18).
    let fetched: Promise<unknown>;
    try {
      fetched = Promise.resolve(source());
    } catch (err) {
      this._voiceLogger.warn('source hydration failed — using local store', err);
      return;
    }
    const tombstones = (this._pendingDeletes = new Set<string>());
    void fetched.then(
      (raw) => {
        if (this._pendingDeletes === tombstones) this._pendingDeletes = null;
        if (this._destroyed || this._reviewer !== forReviewer) return;
        const server = normalizeComments(raw).filter((c) => !tombstones.has(c.id));
        // Two repair cases (codex r16): an id the server LACKS re-announces
        // as 'add'; an id the server has but with an older updatedAt (a lost
        // update — the merge keeps the local content) re-announces as
        // 'update'. Server-newer/tie stays silent (no-echo rule).
        const serverById = new Map(server.map((c) => [c.id, c.updatedAt]));
        const repair = this._store.comments
          .map((c) => {
            const serverUpdatedAt = serverById.get(c.id);
            if (serverUpdatedAt === undefined) return { type: 'add' as const, id: c.id };
            if (c.updatedAt > serverUpdatedAt) return { type: 'update' as const, id: c.id };
            return null;
          })
          .filter((r) => r !== null);
        this._store = { ...this._store, comments: mergeComments(this._store.comments, server) };
        this._persist();
        this._renderPins();
        for (const r of repair) {
          const merged = this._store.comments.find((c) => c.id === r.id);
          if (merged) this._emitChange(r.type, merged);
        }
      },
      (err) => {
        if (this._pendingDeletes === tombstones) this._pendingDeletes = null;
        this._voiceLogger.warn('source hydration failed — using local store', err);
      },
    );
  }

  destroy(): void {
    this._generation += 1;
    window.removeEventListener('resize', this._onReflow);
    document.removeEventListener('scroll', this._onReflow, { capture: true });
    document.removeEventListener('keydown', this._onExportHotkey, true);
    this._gesture?.stop();
    // dispose() may synchronously best-effort persist an in-flight transcript,
    // so the destroyed flag flips only after voice teardown completes.
    this._teardownVoice();
    this._destroyed = true;
    this._closeActiveInput(false);
    if (this._annotating) this._exitAnnotateMode();
    if (this._reflowFrame) cancelAnimationFrame(this._reflowFrame);
    this._closePanel(); // sheet dismiss listeners live on document — must detach
    this._ui.destroy();
  }

  // Release any in-flight voice session and remove its dot. dispose() best-effort
  // persists already-committed transcript text (see session.ts).
  private _teardownVoice(): void {
    const v = this._activeVoice;
    if (!v) return;
    this._activeVoice = null;
    v.abort.abort(); // startup still in flight must not gain a socket or mic
    v.session?.dispose();
    v.mount.remove();
  }

  private _activationMode(): NonNullable<ActivationConfig['mode']> {
    // 'both' by default: the button stays discoverable AND Alt+click /
    // long-press work out of the box (first-user feedback: the obvious power
    // move silently failing reads as broken). 'toggle' remains the opt-out.
    return this._deps.config.activation?.mode ?? 'both';
  }

  // Stealth/both modes add a capture-phase long-press (touch) + Alt+click
  // (desktop) gesture that drops a comment without the visible control button.
  private _startGesture(): void {
    if (this._activationMode() === 'toggle') return;
    this._gesture = new GestureController({
      mode: this._activationMode(),
      longPressMs: LONG_PRESS_MS,
      moveThresholdPx: MOVE_THRESHOLD_PX,
      onActivate: (x, y, target) => this._placeCommentAt(x, y, target),
      // Alt+drag marquee. `suspended` makes the controller inert while armed
      // — the armed press handlers own ALL input then, so neither activation
      // path can double-fire (codex r1 [P2]).
      suspended: () => this._annotating,
      onAreaChange: (x0, y0, x1, y1) => {
        const m =
          this._marquee ??
          (this._marquee = { id: 0, x0, y0, x1, y1, live: true, aborted: false, pending: [] });
        m.x1 = x1;
        m.y1 = y1;
        m.live = true;
        this._scheduleHoverFrame();
      },
      onAreaCommit: (x0, y0, x1, y1) => {
        this._marquee = null;
        this._clearHover();
        this._placeAreaComment(
          Math.min(x0, x1),
          Math.min(y0, y1),
          Math.abs(x1 - x0),
          Math.abs(y1 - y0),
        );
      },
      onAreaCancel: () => {
        this._marquee = null;
        this._scheduleHoverFrame(); // repaint drops the marquee box
      },
    });
    this._gesture.start();
  }

  refreshRoute(): void {
    this._generation += 1;
    // A recording in progress finalizes and persists to its FROZEN route (the
    // host captured the route at dot creation), then the dot is removed.
    const v = this._activeVoice;
    if (v) {
      this._activeVoice = null;
      // A session already RECORDING finalizes normally; startup still in
      // flight aborts (no session yet to stop) — codex #4.
      if (!v.session) v.abort.abort();
      const mount = v.mount;
      void Promise.resolve(v.session?.stop()).finally(() => mount.remove());
    }
    this._closeActiveInput();
    this._renderPins();
  }

  // Scroll/resize only moves existing pins — it never adds or removes them.
  // Re-creating DOM on every scroll frame caused jank; instead, rAF-throttle
  // and just translate existing pin elements.
  private _onReflow = (): void => {
    if (this._reflowFrame) return;
    this._reflowFrame = requestAnimationFrame(() => {
      this._reflowFrame = 0;
      this._repositionPins();
      if (this._panelEl) this._positionPanel();
      if (this._activeInput)
        this._positionInputNearPin(this._activeInput.wrap, this._activeInput.commentId);
    });
  };

  // Theme tokens ride as custom properties on the shadow host and inherit into
  // the shadow tree, where styles.ts consumes them via var(--pf-*,stock).
  private _applyTheme(): void {
    const theme = this._deps.config.theme;
    if (!theme) return;
    for (const [k, v] of Object.entries(theme)) {
      if (v) {
        this._ui.host.style.setProperty(
          `--pf-${k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}`,
          v,
        );
      }
    }
    // One-variable theming: an accent alone derives its readable contrast
    // color (hex accents only — anything fancier, the host sets both).
    if (theme.accent && !theme.accentContrast) {
      const c = contrastFor(theme.accent);
      if (c) this._ui.host.style.setProperty('--pf-accent-contrast', c);
    }
  }

  private _persist(): void {
    this._invalidateViewCaches();
    saveStore(this._deps.storage, this._store);
  }

  // A2: notify the host after a persisted mutation. Host exceptions must never
  // break the annotator, and a torn-down world must never call out.
  private _emitChange(type: 'add' | 'update' | 'delete', comment: Comment): void {
    // Tombstone BEFORE the callback gate: the hydration race exists whether
    // or not the host listens to onChange.
    if (type === 'delete') this._pendingDeletes?.add(comment.id);
    const cb = this._deps.config.onChange;
    if (!cb || this._destroyed) return;
    try {
      // Promise-wrap so a rejected ASYNC handler is contained exactly like a
      // synchronous throw (codex audit #10) — the documented guarantee.
      void Promise.resolve(cb(this._store, { type, comment })).catch((err) =>
        this._voiceLogger.warn('onChange handler threw', err),
      );
    } catch (err) {
      this._voiceLogger.warn('onChange handler threw', err);
    }
  }

  private _invalidateViewCaches(): void {
    this._visibleCache = null;
    this._anchorCache.clear();
  }

  private _renderDock(): void {
    const dock = el('div', 'dock');
    this._dockEl = dock;
    // Reviewer arm segment: a pure arm/disarm toggle — click/drag on the page
    // IS the interface. Stealth stays chromeless; builder never arms.
    if (this._deps.mode === 'reviewer' && this._activationMode() !== 'stealth') {
      const arm = el('button', 'arm', '+');
      arm.type = 'button';
      arm.dataset['active'] = 'false';
      arm.setAttribute('aria-label', 'Annotate this page');
      arm.addEventListener('click', () => this._toggleAnnotateMode());
      dock.appendChild(arm);
      this._armEl = arm;
    }
    this._ui.root.appendChild(dock);
  }

  // The arm segment mirrors the armed state: + arms, × stops.
  private _syncArm(): void {
    const a = this._armEl;
    if (!a) return;
    a.dataset['active'] = String(this._annotating);
    a.textContent = this._annotating ? '×' : '+';
    a.setAttribute('aria-label', this._annotating ? 'Stop annotating' : 'Annotate this page');
  }

  // Builder-only: toggle the aggregate drawer (_closePanel resets aria-expanded).
  private _togglePanel(): void {
    if (this._panelEl) {
      this._closePanel();
      return;
    }
    this._panelAnchor = this._chipEl;
    this._panelKind = 'menu';
    this._panelEl = this._renderBuilderPanel();
    this._ui.root.appendChild(this._panelEl);
    this._positionPanel();
    this._chipEl?.setAttribute('aria-expanded', 'true');
  }

  private _closePanel(): void {
    this._sheetDismiss?.();
    this._sheetDismiss = null;
    this._panelEl?.remove();
    this._panelEl = null;
    this._panelKind = null;
    // Every close path keeps the builder chip's disclosure state honest —
    // Clear all closes the drawer without going through the toggle (codex r2).
    if (this._chipEl?.hasAttribute('aria-expanded'))
      this._chipEl.setAttribute('aria-expanded', 'false');
  }

  // Anchor the panel above whatever summoned it (control bottom-right, chip
  // bottom-left), aligned to the anchor's near edge; flipPosition handles
  // tiny viewports. An anchor can leave the DOM while an async export is in
  // flight (last comment deleted → chip unmounted — codex #6): fall back to
  // the control, then to the chip's home corner.
  private _positionPanel(): void {
    if (!this._panelEl) return;
    const anchor = this._panelAnchor?.isConnected
      ? this._panelAnchor
      : ((this._chipEl?.isConnected ? this._chipEl : null) ??
        (this._armEl?.isConnected ? this._armEl : null));
    const size = {
      width: this._panelEl.offsetWidth || 280,
      height: this._panelEl.offsetHeight || 180,
    };
    const vp = { width: window.innerWidth, height: window.innerHeight };
    if (!anchor) {
      place(this._panelEl, { left: 16, top: Math.max(16, vp.height - size.height - 16) });
      return;
    }
    const rect = anchor.getBoundingClientRect();
    // Chip sits left, control sits right: align the panel toward the wider side.
    const left = rect.left + size.width / 2 > vp.width / 2 ? rect.right - size.width : rect.left;
    place(this._panelEl, flipPosition({ left, top: rect.top - size.height - 8 }, size, vp, 0));
  }

  // ── Anytime export: count chip + summonable sheet ──
  // "Summon, don't station": stealth mode has no standing chrome, so the
  // export affordance is a chip in the pins' own visual vocabulary — it
  // exists only while the reviewer has comments, and reads as the sum of
  // their pins, not as new furniture.

  private _exportUiEnabled(): boolean {
    if (this._deps.mode !== 'reviewer') return false;
    const mode = this._deps.config.exportUi ?? 'auto';
    if (mode === 'never') return false;
    // 'auto': a host that hydrates from a backend (source) owns collation —
    // member-side export there is noise. Local-first installs get it free.
    return mode === 'always' || !this._deps.config.source;
  }

  private _sheetTitle(): string {
    const comments = this._store.comments;
    const screens = new Set(comments.map((c) => c.route)).size;
    const n = (v: number, w: string): string => `${v} ${w}${v === 1 ? '' : 's'}`;
    // Orphans are hidden on the page; the sheet is where they're accounted
    // for (current route only — other routes' elements aren't here to check).
    let lost = 0;
    for (const pin of this._pins.values()) if (pin.dataset['orphaned']) lost++;
    const tail = lost > 0 ? ` · ${lost} unanchored` : '';
    return `${n(comments.length, 'comment')} · ${n(screens, 'screen')}${tail}`;
  }

  // A resolve that came through the fallback chain (fingerprint / fuzzy)
  // means the stored css/xpath went stale — the next load would fall all the
  // way through again, and one more edit could orphan the pin for good.
  // Persist the rebuilt selectors. Deliberately SILENT: no onChange, no
  // updatedAt bump — this is mechanical repair of local anchoring, not
  // reviewer content, and a synced server copy must win the next merge
  // untouched. Fingerprint stays as pinned (it is provenance: the artifact
  // reports what the reviewer actually commented on). Reviewer mode only —
  // builder aggregates other reviewers' stores read-only.
  private _persistHeal(commentId: string, target: Element): void {
    if (this._deps.mode !== 'reviewer') return;
    const c = this._store.comments.find((x) => x.id === commentId);
    if (!c) return;
    const fresh = buildSelectors(target);
    if (!fresh.css) return; // never cement a degenerate selector
    const s = c.anchor.selectors;
    if (
      fresh.css === s.css &&
      fresh.xpath === s.xpath &&
      fresh.testid === s.testid &&
      fresh.id === s.id
    )
      return;
    this._store = {
      ...this._store,
      comments: this._store.comments.map((x) =>
        x.id === commentId ? { ...x, anchor: { ...x.anchor, selectors: fresh } } : x,
      ),
    };
    // NOT _persist(): that invalidates the anchor cache, but a heal describes
    // the very element just cached — flushing it would force a redundant
    // ladder walk on the next reflow frame (P2.2 would regress). The VISIBLE
    // cache, however, still holds pre-heal comment objects and must go, or
    // later re-resolves would use the stale selectors (codex 0.3.0 #6).
    this._visibleCache = null;
    saveStore(this._deps.storage, this._store);
  }

  private _syncChip(): void {
    // Builder: the chip is the drawer summon and always exists — count shows
    // what is visible on this screen (reviewer filters applied).
    if (this._deps.mode === 'builder') {
      if (!this._chipEl) {
        const chip = el('button', 'chip');
        chip.type = 'button';
        chip.setAttribute('aria-expanded', 'false');
        chip.setAttribute('aria-controls', 'pf-drawer');
        chip.addEventListener('click', () => this._togglePanel());
        this._dockEl?.appendChild(chip);
        this._chipEl = chip;
      }
      this._chipEl.textContent = String(this._visibleComments().length);
      this._chipEl.setAttribute('aria-label', 'Pinflow builder drawer');
      this._chipEl.title = 'Pinflow builder';
      return;
    }
    const count = this._exportUiEnabled() ? this._store.comments.length : 0;
    if (count === 0) {
      if (this._chipEl) {
        this._chipEl.remove();
        this._chipEl = null;
        // The sheet is meaningless without comments; menus/confirmations stay
        // (the confirmation must survive its own export — codex #6 anchors it
        // through the connectivity fallback instead).
        if (this._panelKind === 'sheet') this._closePanel();
      }
      return;
    }
    const label = `Export feedback — ${count} comment${count === 1 ? '' : 's'}`;
    if (!this._chipEl) {
      const chip = el('button', 'chip', String(count));
      chip.type = 'button';
      chip.addEventListener('click', () => this._toggleSheet());
      this._dockEl?.appendChild(chip);
      this._chipEl = chip;
    } else {
      this._chipEl.textContent = String(count);
    }
    this._chipEl.setAttribute('aria-label', label);
    this._chipEl.title = label;
    // An open sheet tracks the corpus live (hydration merge, voice commit,
    // deletes) — Export always uses the store, so the label must too (codex #5).
    if (this._panelKind === 'sheet' && this._panelEl) {
      const h = this._panelEl.querySelector('h3');
      if (h) h.textContent = this._sheetTitle();
    }
  }

  private _toggleSheet(): void {
    // Summoning the export surface ends pinning — without this, a chip/hotkey
    // summon over an ARMED menu left the crosshair live and the next host
    // click planted a spurious comment (verification round, reproduced).
    if (this._annotating) this._exitAnnotateMode();
    if (this._panelKind === 'sheet') {
      this._closePanel();
      return;
    }
    this._closePanel(); // a summon REPLACES a menu/confirmation (codex #4)
    // Resolve any open draft losslessly before exporting (codex #3): typed
    // text is saved; a still-empty draft is deleted by the save path.
    this._activeInput?.save();
    // The save can delete the sole (empty) comment — nothing left to export
    // means nothing to summon (codex #8).
    if (this._store.comments.length === 0 || !this._chipEl?.isConnected) return;
    const sheet = this._makePanel(
      this._sheetTitle(),
      'Downloads the markdown and copies it to your clipboard.',
      [
        this._makeButton('Export & share', () => void this._handleReviewerExport(), 'primary'),
        // "& clear": one gesture to close a review pass — export, then wipe,
        // so the applied batch never re-exports next time.
        this._makeButton('Export & clear', () => void this._handleReviewerExport(true)),
      ],
    );
    // Host-owned submission channel (0.5.0: lives here since the menu panel
    // is gone; hosts pairing onSubmit with `source` should set exportUi).
    if (this._deps.config.onSubmit) {
      const row = el('div', 'row');
      row.style.marginTop = '8px';
      row.appendChild(this._makeButton('Send to builder', () => void this._handleOnSubmit()));
      sheet.appendChild(row);
    }
    this._panelAnchor = this._chipEl;
    this._panelKind = 'sheet';
    this._panelEl = sheet;
    this._ui.root.appendChild(sheet);
    this._positionPanel();
    // The chip is exempt from outside-dismiss: its own click must reach the
    // toggle (a physical tap's pointerup would otherwise close the sheet and
    // the trailing click reopen it — codex #7).
    this._sheetDismiss = this._armOutsideDismiss(
      () => [sheet, this._chipEl],
      () => this._closePanel(),
    );
  }

  // Synced hosts stay consistent: every removal goes out as its own delete
  // (PROTOCOL deletes are per-comment; there is no bulk op on the wire).
  private _clearReviewerComments(): void {
    const removed = this._store.comments;
    this._store = { ...this._store, comments: [] };
    this._persist();
    for (const c of removed) this._emitChange('delete', c);
    this._renderPins();
  }

  // Built imperatively to keep reviewer names out of innerHTML.
  private _renderBuilderPanel(): HTMLDivElement {
    const drawer = el('div', 'drawer');
    drawer.id = 'pf-drawer'; // aria-controls target (ids are shadow-scoped)
    const stores = this._allStores();
    drawer.appendChild(el('h3', undefined, 'Builder mode'));

    if (stores.length === 0) {
      const empty = el('p', undefined, 'No comments yet.');
      empty.style.opacity = '0.7';
      drawer.appendChild(empty);
    } else {
      for (const s of stores) {
        const label = el('label');
        const cb = el('input');
        cb.type = 'checkbox';
        cb.checked = true;
        cb.dataset['reviewer'] = s.reviewer;
        cb.checked = !this._builderHidden.has(s.reviewer);
        cb.addEventListener('change', () => {
          if (cb.checked) this._builderHidden.delete(s.reviewer);
          else this._builderHidden.add(s.reviewer);
          this._renderPins();
        });
        label.appendChild(cb);
        label.appendChild(document.createTextNode(` ${s.reviewer} (${s.comments.length})`));
        drawer.appendChild(label);
      }
    }

    const bar = el('div', 'bar');
    bar.append(
      this._makeButton('Export all', () => this.downloadExport()),
      this._makeButton('JSON', () =>
        download(
          this.exportJSON(),
          exportFilename(this._deps.config.project, null, now(), 'json'),
          'application/json',
        ),
      ),
      this._makeButton('Clear all', () => this._handleBuilderClear(), 'danger'),
    );
    drawer.appendChild(bar);
    return drawer;
  }

  private _makeButton(
    label: string,
    onClick: () => void,
    variant?: 'primary' | 'danger',
  ): HTMLButtonElement {
    const b = el('button', variant, label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  // Shared scaffolding for the reviewer panel and the export confirmation.
  private _makePanel(title: string, body: string, buttons: HTMLButtonElement[]): HTMLDivElement {
    const panel = el('div', 'panel');
    const row = el('div', 'row');
    row.append(...buttons);
    panel.append(el('h3', undefined, title), el('p', undefined, body), row);
    return panel;
  }

  private _toggleAnnotateMode(): void {
    if (this._annotating) this._exitAnnotateMode();
    else this._enterAnnotateMode();
  }

  private _enterAnnotateMode(): void {
    // A gesture-owned marquee may be in flight (keyboard-activated arm mid-
    // Alt-drag). It carries a sentinel pointer id the armed handlers must
    // never adopt — clear it BEFORE the armed listeners attach, or its
    // phantom participant strands the abort accounting and the window guard
    // (codex r6 [P2]). The controller press dies SYNCHRONOUSLY here, not via
    // the lazy suspended() probe: a transient arm→disarm between pointer
    // events would otherwise leave it live to commit on release (codex r7).
    this._gesture?.suspendPress();
    this._marquee = null;
    this._clearHover();
    this._annotating = true;
    this._syncArm();
    document.addEventListener('click', this._onDocumentClick, true);
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('pointermove', this._onHoverMove, { passive: true, capture: true });
    document.addEventListener('pointerdown', this._onArmedPointerDown, true);
    document.addEventListener('pointerup', this._onArmedPointerUp, true);
    document.addEventListener('pointercancel', this._onArmedPointerCancel, true);
    this._prevBodyCursor = document.body.style.cursor;
    document.body.style.cursor = 'crosshair';
    // Arming is pinning intent — it replaces whatever surface was up.
    this._closePanel();
  }

  private _exitAnnotateMode(): void {
    this._annotating = false;
    this._syncArm();
    document.removeEventListener('click', this._onDocumentClick, true);
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('pointermove', this._onHoverMove, { capture: true });
    document.removeEventListener('pointerdown', this._onArmedPointerDown, true);
    document.removeEventListener('pointerup', this._onArmedPointerUp, true);
    document.removeEventListener('pointercancel', this._onArmedPointerCancel, true);
    this._marquee = null;
    this._pressGuards(false);
    this._abortGuard(false);
    this._clearHover();
    document.body.style.cursor = this._prevBodyCursor;
    this._prevBodyCursor = '';
  }

  private _onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this._exitAnnotateMode();
  };

  // True for events on pinflow's own chrome, shared by the armed click, hover
  // targeting, and marquee starts. contains() covers the retargeted
  // (host-level) case; composedPath covers edges where the capture target is
  // the shadow-internal node itself — without it, an armed click on pinflow's
  // own UI would both place a bogus pin AND stopPropagation away the
  // control's handler.
  private _isOwnUi(target: unknown, e?: Event): boolean {
    return (
      !(target instanceof Element) ||
      this._ui.host.contains(target) ||
      e?.composedPath?.().includes(this._ui.host) === true
    );
  }

  // rAF-throttled like _onReflow. While a marquee press is live this tracks
  // the drag corner instead of hover-targeting.
  private _onHoverMove = (e: Event): void => {
    const m = this._marquee;
    if (m) {
      if (m.aborted) return; // dead gesture: nothing paints, nothing updates
      const p = e as PointerEvent;
      if ((p.pointerId ?? 0) !== m.id) return; // stray pointers never drive the box
      m.x1 = p.clientX;
      m.y1 = p.clientY;
      // Live threshold, both directions: returning inside it de-latches so a
      // release at the origin is a plain click again — never a 0×0 area.
      m.live = Math.hypot(m.x1 - m.x0, m.y1 - m.y0) > MOVE_THRESHOLD_PX;
      this._scheduleHoverFrame();
      return;
    }
    const target = e.target;
    // Preview = capture: highlight the CANONICAL anchor target (the nearest
    // data-testid ancestor, exactly what a click will store), not the leaf
    // under the cursor — the box the reviewer sees is the box they select.
    this._hoverTarget = this._isOwnUi(target, e) ? null : anchorTarget(target as Element);
    this._scheduleHoverFrame();
  };

  private _scheduleHoverFrame(): void {
    if (this._hoverFrame) return;
    this._hoverFrame = requestAnimationFrame(() => {
      this._hoverFrame = 0;
      this._paintHover();
    });
  }

  private _paintHover(): void {
    const m = this._marquee;
    if (m?.live) {
      const box = this._ensureHoverEl();
      box.dataset['marquee'] = 'true';
      this._sizeHoverEl(
        Math.min(m.x0, m.x1),
        Math.min(m.y0, m.y1),
        Math.abs(m.x1 - m.x0),
        Math.abs(m.y1 - m.y0),
      );
      return;
    }
    const t = this._hoverTarget;
    if (!t?.isConnected) {
      if (this._hoverEl) this._hoverEl.style.display = 'none';
      return;
    }
    const box = this._ensureHoverEl();
    delete box.dataset['marquee'];
    const r = t.getBoundingClientRect();
    this._sizeHoverEl(r.left, r.top, r.width, r.height);
  }

  private _ensureHoverEl(): HTMLDivElement {
    if (!this._hoverEl) {
      this._hoverEl = el('div', 'hl');
      this._ui.root.appendChild(this._hoverEl);
    }
    return this._hoverEl;
  }

  private _sizeHoverEl(left: number, top: number, width: number, height: number): void {
    const s = this._hoverEl!.style;
    s.display = '';
    s.left = `${left}px`;
    s.top = `${top}px`;
    s.width = `${width}px`;
    s.height = `${height}px`;
  }

  // Mouse/pen only: a passive listener cannot preventDefault, so a touch
  // marquee would fight native scrolling — touch keeps click-to-pin. Primary
  // button only (right-drag stays the host's), and the initiating pointerId
  // is recorded so stray pointers can neither resize nor commit the box.
  private _onArmedPointerDown = (e: Event): void => {
    const p = e as PointerEvent;
    if (this._marquee) {
      // A second pointer joining aborts the WHOLE gesture. The state stays
      // (flagged) until EVERY participating pointer has lifted, so each
      // release can swallow its own compatibility click — both orderings
      // (codex r2/r4 [P2]). First join: initiator + joiner are down.
      const m = this._marquee;
      const joiner = p.pointerId ?? 0;
      if (!m.aborted) {
        m.aborted = true;
        m.live = false;
        m.pending = [m.id, joiner];
        this._pressGuards(false);
        // Standing WINDOW-capture interceptor for the abort's lifetime: mid-
        // abort stray clicks must never reach host capture listeners that
        // registered before pinflow (codex r5 [P2]).
        this._abortGuard(true);
        this._scheduleHoverFrame();
      } else if (!m.pending.includes(joiner)) {
        m.pending = [...m.pending, joiner]; // a third+ pointer joined the dead gesture
      }
      return;
    }
    if (p.isPrimary === false || p.pointerType === 'touch' || (p.button ?? 0) !== 0) return;
    if (this._isOwnUi(e.target, e)) return;
    this._marquee = {
      id: p.pointerId ?? 0,
      x0: p.clientX,
      y0: p.clientY,
      x1: p.clientX,
      y1: p.clientY,
      live: false,
      aborted: false,
      pending: [],
    };
    this._pressGuards(true);
  };

  // Suppress text selection and native drag-and-drop for the press duration —
  // the marquee must never fight the browser's drag ghost or leave a
  // selection trail. Press-scoped: zero listeners at rest.
  private _pressGuards(on: boolean): void {
    const fn = on ? document.addEventListener : document.removeEventListener;
    fn.call(document, 'selectstart', this._killDefault, true);
    fn.call(document, 'dragstart', this._killDefault, true);
  }

  private _killDefault = (e: Event): void => {
    e.preventDefault();
  };

  // Standing window-capture click interceptor, alive only while a marquee
  // abort is in flight: the first stop on the propagation path, so it runs
  // before ANY host capture listener regardless of registration order.
  // Idempotent: duplicate add/remove of the same handler is a no-op.
  private _onAbortClick = (ce: Event): void => {
    ce.preventDefault();
    ce.stopImmediatePropagation();
  };

  private _abortGuard(on: boolean): void {
    const fn = on ? window.addEventListener : window.removeEventListener;
    fn.call(window, 'click', this._onAbortClick, true);
  }

  private _onArmedPointerUp = (e: Event): void => {
    const m = this._marquee;
    const p = e as PointerEvent;
    if (!m) return;
    if (m.aborted) {
      // Only PARTICIPANTS retire the abort; each release swallows its own
      // compatibility click (which follows synchronously). The state — and
      // the standing window guard — clear when the last participant lifts
      // (codex r2/r4/r5 [P2]).
      const pid = p.pointerId ?? 0;
      if (!m.pending.includes(pid)) return;
      m.pending = m.pending.filter((x) => x !== pid);
      this._swallowNextClick();
      if (m.pending.length === 0) {
        this._marquee = null;
        this._abortGuard(false);
      }
      return;
    }
    if ((p.pointerId ?? 0) !== m.id) return;
    this._marquee = null;
    this._pressGuards(false);
    const x1 = p.clientX ?? m.x1;
    const y1 = p.clientY ?? m.y1;
    // The RELEASE coordinates decide, not the latched flag — the
    // return-to-origin move can be coalesced away (codex r2 [P2]). Below the
    // threshold the press was a click; _onDocumentClick owns it.
    if (Math.hypot(x1 - m.x0, y1 - m.y0) <= MOVE_THRESHOLD_PX) {
      this._scheduleHoverFrame(); // drop any stale marquee box
      return;
    }
    this._swallowNextClick();
    this._exitAnnotateMode();
    this._placeAreaComment(
      Math.min(m.x0, x1),
      Math.min(m.y0, y1),
      Math.abs(x1 - m.x0),
      Math.abs(y1 - m.y0),
    );
  };

  // The drag's trailing click must reach neither pinflow (double pin) nor the
  // host (a drag is not a click). WINDOW capture — the first stop on the
  // propagation path — so it runs before any host document-capture listener
  // regardless of registration order; stopImmediatePropagation silences
  // same-node listeners too (codex r1 [P1]). Swallows exactly ONE click; the
  // 0-timeout clears the no-click case — a mouse click fires synchronously
  // after pointerup, so a later genuine click is never eaten.
  private _swallowNextClick(): void {
    const swallow = (ce: Event): void => {
      window.removeEventListener('click', swallow, true); // one-shot, self-removing
      ce.preventDefault();
      ce.stopImmediatePropagation();
    };
    window.addEventListener('click', swallow, true);
    window.setTimeout(() => window.removeEventListener('click', swallow, true), 0);
  }

  private _onArmedPointerCancel = (e: Event): void => {
    const m = this._marquee;
    if (!m) return;
    if (m.aborted) {
      // No compatibility click follows a cancel — just retire the participant.
      const pid = (e as PointerEvent).pointerId ?? 0;
      if (!m.pending.includes(pid)) return;
      m.pending = m.pending.filter((x) => x !== pid);
      if (m.pending.length === 0) {
        this._marquee = null;
        this._abortGuard(false);
      }
      return;
    }
    const pid = (e as PointerEvent).pointerId;
    if (pid !== undefined && pid !== m.id) return; // a stray pointer's cancel is not ours
    this._marquee = null;
    this._pressGuards(false);
    this._scheduleHoverFrame(); // repaint drops the marquee box
  };

  // Resolve the tightest element whose box contains the drawn rect, then drop
  // a NORMAL element-anchored comment (pin at the rect's center) carrying the
  // rect as percentages of that element.
  private _placeAreaComment(left: number, top: number, width: number, height: number): void {
    const cx = left + width / 2;
    const cy = top + height / 2;
    let target: Element | null = document.elementFromPoint?.(cx, cy) ?? null;
    if (target && this._ui.host.contains(target)) target = null; // a pin under the center
    const contains = (elm: Element): boolean => {
      const r = elm.getBoundingClientRect();
      return r.left <= left && r.top <= top && r.right >= left + width && r.bottom >= top + height;
    };
    while (target && !contains(target)) target = target.parentElement;
    // buildAnchor canonicalizes to the nearest data-testid ancestor — the
    // rect must be measured against THAT element, or areaPercent and the
    // selectors would describe different boxes (codex r1 [P1]).
    const anchorEl = anchorTarget(target ?? document.body);
    const tr = anchorEl.getBoundingClientRect();
    const clamp = (v: number): number => Math.min(100, Math.max(0, v));
    // Compound-clamped at the source: x+w and y+h can never exceed 100, so
    // the stored rect is honest about staying inside its anchor (codex fr1).
    const x = clamp(((left - tr.left) / tr.width) * 100);
    const y = clamp(((top - tr.top) / tr.height) * 100);
    const area: AreaPercent | undefined =
      tr.width > 0 && tr.height > 0
        ? {
            x,
            y,
            w: Math.min(clamp((width / tr.width) * 100), 100 - x),
            h: Math.min(clamp((height / tr.height) * 100), 100 - y),
          }
        : undefined;
    this._placeCommentAt(cx, cy, anchorEl, area);
  }

  private _clearHover(): void {
    if (this._hoverFrame) {
      cancelAnimationFrame(this._hoverFrame);
      this._hoverFrame = 0;
    }
    this._hoverTarget = null;
    this._hoverEl?.remove();
    this._hoverEl = null;
  }

  private _onDocumentClick = (e: MouseEvent): void => {
    // Any in-flight armed press (pending, live, or aborted) means this click
    // belongs to ANOTHER pointer — e.g. a joiner lifting before the marquee's
    // initiator releases. It places nothing AND is consumed: armed mode owns
    // input, so no mid-gesture click may leak to the host (codex r3/r4 [P2]).
    if (this._marquee) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (this._isOwnUi(e.target, e)) return;
    e.preventDefault();
    e.stopPropagation();
    this._exitAnnotateMode();
    this._placeCommentAt(e.clientX, e.clientY, e.target as Element);
  };

  // Stealth defers the (blocking) identity prompt from init to the first
  // activation — the moment identity is actually needed, right before any
  // comment can be created. Declining leaves the layer dormant; the next
  // activation asks again. Resolving loads that reviewer's existing corpus.
  private _ensureIdentity(): boolean {
    if (this._reviewer !== null) return true;
    const name = this._deps.resolveIdentity?.() ?? null;
    if (!name) return false;
    this._reviewer = name;
    this._store =
      loadStore(this._deps.storage, this._deps.config.project, name) ??
      emptyStore(this._deps.config.project, name);
    this._renderPins();
    this._hydrateFromSource(); // the store just became real — sync it (L2.1)
    return true;
  }

  // Shared by the toggle click path and the stealth gesture: drop an anchored
  // note at a screen point. Voice-configured → a streaming voice dot; otherwise
  // the classic text input.
  private _placeCommentAt(
    clientX: number,
    clientY: number,
    target: Element,
    area?: AreaPercent,
  ): void {
    if (this._ui.host.contains(target)) return; // never annotate our own UI
    if (!this._ensureIdentity()) return; // identity is required before any comment exists
    const anchor: Anchor = {
      ...buildAnchor(target, clientX, clientY),
      ...(area ? { areaPercent: area } : {}),
    };
    if (this._deps.config.voice) {
      if (this._activeVoice) return; // one recording at a time
      this._startVoiceDot(anchor, clientX, clientY);
      return;
    }
    this._commitTextComment(anchor, '', true);
  }

  // `route`/`fullUrl` default to the current location; the voice degrade path
  // passes BOTH frozen at dot creation — they describe one moment and must
  // never split across a navigation (codex audit #32).
  private _commitTextComment(
    anchor: Anchor,
    text: string,
    openForEdit: boolean,
    route?: string,
    fullUrl?: string,
  ): void {
    const t = now();
    const comment: Comment = {
      id: createId(),
      createdAt: t,
      updatedAt: t,
      route: route ?? this._routeKey(),
      fullUrl: fullUrl ?? window.location.href,
      text,
      modality: 'text',
      anchor,
    };
    this._store = upsertComment(this._store, comment);
    this._persist();
    this._emitChange('add', comment);
    this._renderPins();
    if (openForEdit) this._openInput(comment.id);
  }

  private _loadVoiceModule(): Promise<VoiceModule> {
    return (this._deps.loadVoice ?? defaultLoadVoice)();
  }

  // Drop a voice dot, lazily load the voice module, and start a session — with
  // generation guards so an import/start resolving after teardown self-cancels
  // and releases whatever it produced.
  private _startVoiceDot(anchor: Anchor, clientX: number, clientY: number): void {
    const mount = el('div');
    mount.style.cssText = 'position:fixed;';
    place(
      mount,
      flipPosition(
        { left: clientX, top: clientY },
        { width: 280, height: 140 },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
    this._ui.root.appendChild(mount);

    const active: ActiveVoice = { mount, session: null, abort: new AbortController() };
    this._activeVoice = active;
    const myGen = this._generation;
    const route = this._routeKey();
    // fullUrl freezes WITH the route (codex audit #32): both describe where
    // the recording began, and navigation mid-finalize must not split them.
    const host = this._buildVoiceHost(mount, anchor, route, window.location.href, active, myGen);

    this._loadVoiceModule()
      .then((mod) => {
        if (myGen !== this._generation) {
          mount.remove();
          return;
        }
        return mod.start(host).then((session) => {
          if (myGen !== this._generation) {
            session.dispose();
            mount.remove();
            return;
          }
          active.session = session;
        });
      })
      .catch((err) => {
        this._voiceLogger.warn('voice module failed to load', err);
        if (myGen === this._generation) host.degradeToText();
      });
  }

  private _buildVoiceHost(
    mount: HTMLDivElement,
    anchor: Anchor,
    route: string,
    fullUrl: string,
    active: ActiveVoice,
    gen: number,
  ): VoiceHost {
    const commitVoice = (text: string, voice: VoiceMeta): void => {
      if (this._activeVoice === active) this._activeVoice = null;
      const t = now();
      const comment: Comment = {
        id: createId(),
        createdAt: t,
        updatedAt: t,
        route,
        fullUrl,
        text,
        modality: 'voice',
        voice,
        anchor,
      };
      this._store = upsertComment(this._store, comment);
      this._persist();
      this._emitChange('add', comment);
      mount.remove();
      this._renderPins();
    };
    return {
      config: this._deps.config.voice ?? {},
      mount,
      anchor,
      route,
      // destroy() guards: after teardown a late callback must not touch the
      // DOM or instance state — but a transcript that finished finalizing
      // AFTER destroy() (stop() was in flight when the host tore down) is
      // still the reviewer's words: persist it STORAGE-ONLY so it is not
      // lost (codex audit #5). Reads the stored corpus fresh because
      // `this._store` is part of the dead world.
      commit: ({ text, voice }) => {
        if (this._destroyed) {
          if (text.trim().length === 0 || this._reviewer === null) return;
          const t = now();
          const stored =
            loadStore(this._deps.storage, this._deps.config.project, this._reviewer) ??
            emptyStore(this._deps.config.project, this._reviewer);
          saveStore(
            this._deps.storage,
            upsertComment(stored, {
              id: createId(),
              createdAt: t,
              updatedAt: t,
              route,
              fullUrl,
              text,
              modality: 'voice',
              voice,
              anchor,
            }),
          );
          return;
        }
        commitVoice(text, voice);
      },
      discard: () => {
        if (this._destroyed) return;
        if (this._activeVoice === active) this._activeVoice = null;
        mount.remove();
      },
      degradeToText: (prefill) => {
        if (this._destroyed) return;
        if (this._activeVoice === active) this._activeVoice = null;
        mount.remove();
        // After a route change (generation bumped) the recording's route is no
        // longer on screen: persist any transcript to the FROZEN route, but
        // never open an editor there — and drop a degrade with nothing to say.
        const live = gen === this._generation;
        const text = prefill ?? '';
        if (!live && text.length === 0) return;
        this._commitTextComment(anchor, text, live, route, fullUrl);
      },
      logger: this._voiceLogger,
      signal: active.abort.signal,
    };
  }

  // Memoized: the builder branch does a full localStorage key scan + parse of
  // every reviewer corpus — far too expensive for the per-frame reflow path.
  private _visibleComments(): Array<Comment & { reviewer?: string }> {
    if (this._visibleCache) return this._visibleCache;
    const route = this._routeKey();
    this._visibleCache =
      this._deps.mode === 'builder'
        ? this._allStores()
            .filter((s) => !this._builderHidden.has(s.reviewer))
            .flatMap((s) =>
              s.comments
                .filter((c) => c.route === route)
                .map((c) => ({ ...c, reviewer: s.reviewer })),
            )
        : this._store.comments.filter((c) => c.route === route);
    return this._visibleCache;
  }

  private _renderPins(): void {
    this._invalidateViewCaches();
    // Every count-changing path funnels through here (place, save-dismiss of
    // an empty draft, delete, hydration merge, builder clear), so the export
    // chip stays honest with one sync point.
    this._syncChip();
    for (const el of this._pins.values()) el.remove();
    this._pins.clear();
    for (const el of this._areas.values()) el.remove();
    this._areas.clear();
    const comments = this._visibleComments();
    comments.forEach((c, i) => {
      const target = resolveAnchor(c.anchor);
      this._anchorCache.set(c.id, target);
      if (target) this._persistHeal(c.id, target);
      // A real <button>: keyboard operability (Enter/Space) and focusability
      // come from the platform, not from re-implemented key handlers.
      const pin = el('button', 'pin', String(i + 1));
      pin.type = 'button';
      // L2.3: dispositioned pins render muted (styles.ts); done swaps the
      // number for a ✓, with the index preserved in the title.
      if (isResolved(c) && c.status) {
        pin.dataset['status'] = c.status;
        if (c.status === 'done') {
          pin.textContent = '✓';
          pin.title = `Comment ${i + 1} — done`;
        }
      }
      if (c.reviewer) pin.title = c.reviewer;
      pin.setAttribute('aria-label', pin.title || `Comment ${i + 1}`);
      pin.addEventListener('click', (e) => {
        e.stopPropagation();
        // Opening an existing comment takes over from armed placement — leave
        // annotate mode so the next outside click can't place a spurious pin.
        if (this._annotating) this._exitAnnotateMode();
        if (this._deps.mode === 'builder') {
          this._openBuilderView(c);
          return;
        }
        this._openInput(c.id);
      });
      // Every comment gets a footprint element: drawn areas show the drawn
      // rect, element-anchored points show the CAPTURED element's bounds
      // (_placeArea hides degenerate cases — orphans, near-viewport anchors).
      const area = el('div', 'area');
      if (isResolved(c) && c.status) area.dataset['status'] = c.status;
      this._placeArea(area, c, target);
      this._ui.root.appendChild(area);
      this._areas.set(c.id, area);
      this._placePin(pin, c, target);
      this._ui.root.appendChild(pin);
      this._pins.set(c.id, pin);
    });
  }

  // The footprint is the anchored element's live rect × the stored
  // percentages — recomputed wherever pins are placed, so it rides the same
  // cached-anchor reflow path (orphaned: hidden with its pin).
  private _placeArea(area: HTMLDivElement, comment: Comment, target: Element | null): void {
    const a = comment.anchor.areaPercent;
    if (!target) {
      area.style.display = 'none';
      return;
    }
    const r = target.getBoundingClientRect();
    // Element-anchored comments footprint the captured element itself, except
    // degenerate anchors: collapsed boxes, or near-viewport ones (a click on
    // empty space anchors <body> — ants around the whole page are noise).
    const rect = a
      ? this._areaRect(a, r)
      : r.width >= 1 &&
          r.height >= 1 &&
          (r.width < window.innerWidth * 0.9 || r.height < window.innerHeight * 0.9)
        ? r
        : null;
    if (!rect) {
      area.style.display = 'none';
      return;
    }
    const s = area.style;
    s.display = '';
    s.left = `${rect.left}px`;
    s.top = `${rect.top}px`;
    s.width = `${rect.width}px`;
    s.height = `${rect.height}px`;
  }

  // The RENDERED footprint rect, shared by the footprint and its pin (the pin
  // straddles this rect's top-left corner — they must never drift apart).
  // Compound clamp: stored data is untrusted (each leaf validates 0–100
  // independently, but x+w may exceed 100) — never paint past the anchor.
  // The 2px visibility floor (an axis-aligned drag's line must not vanish)
  // is capped to the anchor and shifts the box INWARD at clamped edges, so
  // position + extent stay inside the anchor together (codex fr1/fr2).
  private _areaRect(
    a: AreaPercent,
    r: DOMRect,
  ): { left: number; top: number; width: number; height: number } {
    const width = Math.min(Math.max(2, (Math.min(a.w, 100 - a.x) / 100) * r.width), r.width);
    const height = Math.min(Math.max(2, (Math.min(a.h, 100 - a.y) / 100) * r.height), r.height);
    return {
      left: r.left + Math.max(0, Math.min((a.x / 100) * r.width, r.width - width)),
      top: r.top + Math.max(0, Math.min((a.y / 100) * r.height, r.height - height)),
      width,
      height,
    };
  }

  private _placePin(pin: HTMLButtonElement, comment: Comment, target: Element | null): void {
    if (!target) {
      // Orphaned pin: HIDDEN, not a gray floater — a parked dot pointing at
      // nothing reads as breakage (first-user feedback). The element stays
      // mounted so the bounded retry can heal and un-hide it; the export
      // sheet surfaces the unanchored count instead.
      pin.dataset['orphaned'] = 'true';
      pin.style.display = 'none';
      return;
    }
    delete pin.dataset['orphaned'];
    pin.style.display = '';
    // Area pins straddle the footprint's top-left corner (the pin's own
    // translate(-50%,-50%) centers it ON the corner point) — derived at
    // render from areaPercent, so display policy needs no schema change and
    // positionPercent keeps recording the drawn center as provenance.
    const a = comment.anchor.areaPercent;
    place(
      pin,
      a
        ? this._areaRect(a, target.getBoundingClientRect())
        : anchorToScreen(target, comment.anchor.positionPercent),
    );
  }

  // Cheap path used on scroll/resize: just reposition existing pins, skipping
  // the querySelector + element-create cost of a full renderPins().
  private _repositionPins(): void {
    // Orphan recovery is bounded, not per-frame: an anchor that mounted AFTER
    // the initial render (async host content) re-runs the ladder at most every
    // 500ms during reflow, so scrolling stays cheap while orphans can heal
    // (codex audit #22).
    const t = performance.now();
    const retryOrphans = t - this._orphanRetryAt > 500;
    if (retryOrphans) this._orphanRetryAt = t;
    const byId = new Map(this._visibleComments().map((c) => [c.id, c]));
    for (const [id, pin] of this._pins) {
      const c = byId.get(id);
      if (!c) continue;
      let target = this._cachedAnchor(c);
      if (target === null && retryOrphans) {
        target = resolveAnchor(c.anchor);
        this._anchorCache.set(c.id, target);
        if (target) this._persistHeal(c.id, target);
      }
      this._placePin(pin, c, target);
      const area = this._areas.get(id);
      if (area) this._placeArea(area, c, target);
    }
    // Orphan state may have flipped either way — keep an open sheet honest.
    if (this._panelKind === 'sheet' && this._panelEl) {
      const h = this._panelEl.querySelector('h3');
      if (h) h.textContent = this._sheetTitle();
    }
  }

  // Reflow path never re-runs the full selector ladder. A cached element that
  // left the DOM (host re-render) is re-resolved once and re-cached; an
  // orphaned (null) entry stays parked between bounded retries (see
  // _repositionPins) — its position can't change per frame.
  private _cachedAnchor(c: Comment): Element | null {
    const hit = this._anchorCache.get(c.id);
    if (hit === null || (hit !== undefined && hit.isConnected)) return hit;
    const el = resolveAnchor(c.anchor);
    this._anchorCache.set(c.id, el);
    return el;
  }

  // Explicit-save popup: Save (or Cmd/Ctrl+Enter) persists; Escape or clicking
  // anywhere outside dismisses, dropping unsaved edits. Dismissing a comment
  // whose saved text is still empty deletes it — no orphan pins littering the
  // page from an accidental gesture.
  private _openInput(commentId: string): void {
    this._closeActiveInput();
    const comment = this._store.comments.find((c) => c.id === commentId);
    if (!comment) return;
    // A resolved comment opens as a frozen read-only view: readOnly textarea
    // (text stays selectable/copyable), a muted disposition line in place of
    // the Save/Delete row. Esc/outside-click still close it.
    const frozen = isResolved(comment);
    const wrap = el('div', 'input');
    const ta = el('textarea');
    ta.placeholder = 'What should change?';
    ta.value = comment.text;
    ta.rows = 3;
    ta.readOnly = frozen;
    wrap.appendChild(ta);
    if (frozen) {
      const mark = comment.status === 'done' ? '✓ Done' : '✕ Declined';
      const note = comment.resolution ? ` — ${comment.resolution}` : '';
      wrap.appendChild(el('div', 'res', mark + note));
    }
    this._ui.root.appendChild(wrap);

    const save = (): void => {
      if (this._destroyed || frozen) return;
      const persisted = this._store.comments.find((c) => c.id === commentId);
      // Hydration can disposition this very comment while the editor is open;
      // a resolved record is the team's, so the stale edit is discarded
      // (codex audit #7).
      if (persisted && isResolved(persisted)) {
        this._closeActiveInput(false);
        return;
      }
      if (persisted && ta.value !== persisted.text) {
        // Hand-correcting a voice transcript flags the meta as edited (immutably).
        const voicePatch = persisted.voice ? { voice: { ...persisted.voice, edited: true } } : {};
        const updated: Comment = {
          ...persisted,
          text: ta.value,
          updatedAt: now(),
          ...voicePatch,
        };
        this._store = upsertComment(this._store, updated);
        this._persist();
        this._emitChange('update', updated);
      }
      this._closeActiveInput();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation(); // don't also exit annotate mode
        this._closeActiveInput();
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        save();
      }
    };
    ta.addEventListener('keydown', onKey);
    // The chip is exempt so a tap on it reaches _toggleSheet, which saves this
    // draft losslessly instead of the outside-tap discarding it (codex #3).
    const disarm = this._armOutsideDismiss(
      () => [wrap, this._chipEl],
      () => this._closeActiveInput(),
    );
    if (!frozen) {
      const actions = el('div', 'actions');
      const del = el('button', 'delete', 'Delete');
      del.type = 'button';
      del.addEventListener('click', () => {
        const removed = this._store.comments.find((c) => c.id === commentId);
        this._store = deleteCommentFromStore(this._store, commentId);
        this._persist();
        if (removed) this._emitChange('delete', removed);
        this._closeActiveInput(false); // already gone — nothing to clean up
        this._renderPins();
      });
      const saveBtn = el('button', 'save', 'Save');
      saveBtn.type = 'button';
      saveBtn.addEventListener('click', save);
      if (this._exportUiEnabled()) {
        // Anytime export from the moment of engagement: SAVES the draft
        // first (never silently discards typed text), then summons the sheet.
        const exp = el('button', 'exportall', `Export all · ${this._store.comments.length}`);
        exp.type = 'button';
        // _toggleSheet saves the draft itself (ActiveInput.save) — one path.
        exp.addEventListener('click', () => this._toggleSheet());
        actions.append(del, exp, saveBtn);
      } else {
        actions.append(del, saveBtn);
      }
      wrap.appendChild(actions);
    }
    this._positionInputNearPin(wrap, commentId);
    ta.focus();
    this._activeInput = {
      wrap,
      commentId,
      cleanup: disarm,
      save: () => (frozen ? this._closeActiveInput() : save()),
    };
  }

  // Builder pins open a READ-ONLY view (codex #14): the aggregate is the
  // team's record, so text is selectable/copyable but never editable here,
  // with the reviewer attribution and any disposition beneath. Same dismiss
  // semantics as every other surface.
  private _openBuilderView(c: Comment & { reviewer?: string }): void {
    this._closeActiveInput(false);
    const wrap = el('div', 'input');
    const ta = el('textarea');
    ta.value = c.text;
    ta.readOnly = true;
    ta.rows = 3;
    wrap.appendChild(ta);
    const mark = c.status === 'done' ? ' · ✓ Done' : c.status === 'declined' ? ' · ✕ Declined' : '';
    wrap.appendChild(el('div', 'res', `${c.reviewer ?? 'Reviewer'}${mark}`));
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this._closeActiveInput(false);
      }
    };
    ta.addEventListener('keydown', onKey);
    this._ui.root.appendChild(wrap);
    this._positionInputNearPin(wrap, c.id);
    const disarm = this._armOutsideDismiss(
      () => [wrap, this._chipEl],
      () => this._closeActiveInput(false),
    );
    this._activeInput = {
      wrap,
      commentId: c.id,
      cleanup: disarm,
      save: () => this._closeActiveInput(false),
    };
  }

  // Dismissal requires a COMPLETED outside tap: armed on pointerdown, fired
  // on the matching pointerup. A second finger joining (pinch — on iOS the
  // recovery gesture after input auto-zoom) or the browser stealing the
  // gesture (pointercancel: touch scroll, pinch-zoom) aborts instead of
  // firing. composedPath (not target) because document-level listeners see
  // shadow-internal events retargeted to the host. Armed on the next task so
  // the gesture that opened the surface can't instantly close it. isPrimary
  // is only ever false on real multi-touch — plain events (jsdom, synthetic)
  // count as primary. Shared by the draft popup and the export sheet; the
  // returned disarm is idempotent-safe cleanup. `within` is a thunk returning
  // the elements that do NOT count as outside (the surface itself + the chip,
  // whose taps must reach their own click handlers — codex #3/#7); a thunk
  // because the chip can be created/removed while the surface is open.
  private _armOutsideDismiss(
    within: () => Array<HTMLElement | null>,
    onDismiss: () => void,
  ): () => void {
    let pendingTap: number | null = null;
    const inside = (e: Event): boolean => {
      const path = e.composedPath();
      return within().some((elm) => elm !== null && path.includes(elm));
    };
    const onOutsideDown = (e: Event): void => {
      const p = e as PointerEvent;
      if (p.isPrimary === false) {
        // A second finger ANYWHERE (even on the surface) makes this a pinch,
        // so the containment check must come after — codex r20.
        pendingTap = null;
        return;
      }
      if (inside(e)) return;
      pendingTap = p.pointerId ?? 0;
    };
    const onOutsideUp = (e: Event): void => {
      if (pendingTap === null || ((e as PointerEvent).pointerId ?? 0) !== pendingTap) return;
      pendingTap = null;
      if (inside(e)) return; // released back inside
      onDismiss();
    };
    const onOutsideCancel = (e: Event): void => {
      if (((e as PointerEvent).pointerId ?? 0) === pendingTap) pendingTap = null;
    };
    const arm = window.setTimeout(() => {
      document.addEventListener('pointerdown', onOutsideDown, true);
      document.addEventListener('pointerup', onOutsideUp, true);
      document.addEventListener('pointercancel', onOutsideCancel, true);
    }, 0);
    return () => {
      window.clearTimeout(arm);
      document.removeEventListener('pointerdown', onOutsideDown, true);
      document.removeEventListener('pointerup', onOutsideUp, true);
      document.removeEventListener('pointercancel', onOutsideCancel, true);
    };
  }

  private _positionInputNearPin(wrap: HTMLDivElement, commentId: string): void {
    const pin = this._pins.get(commentId);
    if (!pin) return;
    const pr = pin.getBoundingClientRect();
    place(
      wrap,
      flipPosition(
        { left: pr.right, top: pr.top },
        { width: wrap.offsetWidth || 280, height: wrap.offsetHeight || 120 },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }

  // Closing never saves — Save is explicit. A dismissed comment whose SAVED
  // text is still empty gets deleted (`cleanupEmpty=false` for delete/destroy:
  // delete already removed it; destroy must not write during teardown).
  private _closeActiveInput(cleanupEmpty = true): void {
    const input = this._activeInput;
    if (!input) return;
    this._activeInput = null;
    input.cleanup();
    input.wrap.remove();
    if (!cleanupEmpty || this._destroyed) return;
    const c = this._store.comments.find((x) => x.id === input.commentId);
    // Resolved comments are exempt: they can't be empty in practice (the team
    // dispositioned real feedback) but a shared record must never self-delete.
    if (c && c.text === '' && !isResolved(c)) {
      this._store = deleteCommentFromStore(this._store, input.commentId);
      this._persist();
      this._emitChange('delete', c);
      this._renderPins();
    }
  }

  // Only classify comments on the current route — we can't tell if a comment
  // on another route would resolve without navigating there, so those stay
  // "live" conservatively (spec §5.2 intent: orphaned = element missing now).
  private _isOrphaned = (c: Comment): boolean => {
    if (c.route !== this._routeKey()) return false;
    return resolveAnchor(c.anchor) === null;
  };

  /**
   * Current corpus as versioned JSON (`{ pinflowExport, generatedAt, comments }`):
   * this reviewer's store in reviewer mode, every reviewer's in builder mode.
   * Public — exposed on the init() handle for host-owned pipelines.
   */
  exportJSON(): string {
    return exportStoresJSON(this._deps.mode === 'builder' ? this._allStores() : this._store);
  }

  private _allStores(): ReviewerStore[] {
    return loadAllStores(this._deps.storage, this._deps.config.project);
  }

  /**
   * Markdown artifact via the same generator as the export button (builder
   * mode aggregates all stores). Public — hosts own the submission moment
   * (stealth has no chrome), so the handle exposes this.
   */
  exportMarkdown(): string {
    return this._buildArtifact()[0];
  }

  /**
   * Download the markdown artifact + copy it to the clipboard, with NO
   * confirmation panel — the host owns that UX. Public, on the handle.
   */
  downloadExport(): void {
    const [md, filename] = this._buildArtifact();
    download(md, filename);
    void copyToClipboard(md);
  }

  // Single source for the markdown artifact + its filename, mode-aware.
  private _buildArtifact(): [md: string, filename: string] {
    const { project, describeRoute } = this._deps.config;
    const meta = { generatedAt: now(), project };
    const builder = this._deps.mode === 'builder';
    return [
      builder
        ? exportBuilder(this._allStores(), meta, this._isOrphaned, describeRoute)
        : exportReviewer(this._store, meta, this._isOrphaned, describeRoute),
      exportFilename(project, builder ? null : this._store.reviewer, meta.generatedAt),
    ];
  }

  private async _handleReviewerExport(clear = false): Promise<void> {
    // Export is a terminal action for the armed state: the reviewer moved on
    // from pinning (codex 0.3.0 #4). Disarm BEFORE capturing the ownership
    // panel — disarming may rebuild an open menu.
    if (this._annotating) this._exitAnnotateMode();
    const [md, filename] = this._buildArtifact();
    download(md, filename);
    const startedFrom = this._panelEl;
    const copied = await copyToClipboard(md);
    // A slow clipboard must not resurrect stale UI (codex audit #23): the
    // confirmation appears only if the EXACT surface that launched the export
    // is still open — a closed or replaced panel invalidates it entirely.
    if (this._destroyed || this._panelEl === null || this._panelEl !== startedFrom) return;
    // Clear only after the ownership check: an abandoned surface must not
    // wipe data behind the reviewer's back. _syncChip may close the sheet at
    // zero; the confirmation is 'confirm'-kind and anchors via the fallback.
    if (clear) this._clearReviewerComments();
    this._showConfirmation(copied, clear);
  }

  // Spec §5.6: after reviewer export, show a small confirmation panel
  // suggesting any share channel, rather than closing silently. With
  // config.submitTo the hand-off turns active: a primary mailto button
  // completes the zero-backend submission channel (download + clipboard +
  // prefilled email).
  private _showConfirmation(copied: boolean, cleared = false): void {
    this._closePanel();
    const submitTo = this._deps.config.submitTo;
    // download() fires a DETACHED a.click() and returns void: no event, no
    // promise, so a completed save is not observable in general. It frequently
    // no-ops in iOS in-app webviews — exactly where a reviewer on a phone ends
    // up — and asserting "Saved to your downloads" there is a lie the reviewer
    // then acts on. The clipboard write is the only verified channel, so it is
    // the only one we state, together with the recovery it enables.
    const cleanup = cleared ? ' Comments cleared.' : '';
    let body = copied
      ? `Copied to your clipboard. If no file downloaded, paste it instead.${cleanup}`
      : `Check your downloads for the file.${cleanup}`;
    const buttons = [this._makeButton('Done', () => this._closePanel())];
    if (submitTo) {
      // Without a clipboard there is nothing to paste, so the mailto hand-off
      // has to point at the file instead of opening an empty email.
      body = copied
        ? `Your feedback is copied — paste it into the email.${cleanup}`
        : `Attach the downloaded file to the email.${cleanup}`;
      buttons.unshift(
        this._makeButton(
          'Email it to the builder',
          () => {
            // location.href (not window.open) — mailto: never blocks on popups.
            location.href = `mailto:${submitTo.email}?subject=${encodeURIComponent(
              submitTo.subject ?? `Feedback: ${this._deps.config.project}`,
            )}`;
          },
          'primary',
        ),
      );
    }
    const panel = this._makePanel('Your feedback is ready', body, buttons);
    this._panelEl = panel;
    this._panelKind = 'confirm';
    this._ui.root.appendChild(panel);
    this._positionPanel();
  }

  private _handleBuilderClear(): void {
    if (!window.confirm('Clear all comments for this project?')) return;
    clearProject(this._deps.storage, this._deps.config.project);
    this._renderPins();
    this._closePanel();
  }

  private async _handleOnSubmit(): Promise<void> {
    if (!this._deps.config.onSubmit) return;
    if (this._annotating) this._exitAnnotateMode();
    try {
      await this._deps.config.onSubmit(this._store);
    } catch (err) {
      this._voiceLogger.warn('onSubmit handler threw', err);
    }
  }
}
