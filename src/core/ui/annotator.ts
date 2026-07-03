import { anchorToScreen, buildAnchor, resolveAnchor } from '../anchor';
import { copyToClipboard, downloadMarkdown } from '../download';
import { exportBuilder, exportFilename, exportReviewer } from '../export';
import { createId } from '../id';
import { now } from '../time';
import { routeKey } from '../route-key';
import {
  clearProject,
  deleteComment as deleteCommentFromStore,
  emptyStore,
  loadAllStores,
  loadStore,
  saveStore,
  upsertComment,
} from '../storage';
import type {
  ActivationConfig,
  Anchor,
  Comment,
  Mode,
  PinflowConfig,
  ReviewerStore,
  VoiceMeta,
} from '../types';
import { GestureController } from '../gesture/controller';
import type { Logger, VoiceHost, VoiceModule, VoiceSession } from '../voice-contract';
import { loadVoice as defaultLoadVoice } from '../voice-loader';
import { createUIRoot, el, flipPosition, place, type UIRoot } from './dom';

const DEFAULT_LONG_PRESS_MS = 500;
const MOVE_THRESHOLD_PX = 10;

interface AnnotatorDeps {
  config: Required<Pick<PinflowConfig, 'project'>> & PinflowConfig;
  reviewer: string;
  mode: Mode;
  storage: Storage;
  /** Injectable for tests; defaults to the real lazy `import('pinflow/voice')`. */
  loadVoice?: () => Promise<VoiceModule>;
}

interface ActiveVoice {
  mount: HTMLDivElement;
  session: VoiceSession | null;
}

interface ActiveInput {
  wrap: HTMLDivElement;
  commentId: string;
  /** Pending debounced-save timer id; 0 = none armed. */
  timer: number;
  /** Save the textarea's current text now (idempotent; clears the timer). */
  flush(): void;
}

type PositionCorner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

export class Annotator {
  private readonly _ui: UIRoot;
  private readonly _deps: AnnotatorDeps;
  private _store: ReviewerStore;
  private _annotating = false;
  private _pins = new Map<string, HTMLDivElement>();
  // Reflow-path caches (P2.1/P2.2): repositioning runs at up to 60fps, so it
  // must never re-scan localStorage or re-run the selector ladder per frame.
  // Both are dropped whenever data or route changes (persist / renderPins).
  private _visibleCache: Array<Comment & { reviewer?: string }> | null = null;
  private readonly _anchorCache = new Map<string, Element | null>();
  private _activeInput: ActiveInput | null = null;
  private _controlEl!: HTMLButtonElement;
  private _panelEl: HTMLDivElement | null = null;
  private _reflowFrame = 0;
  private _gesture: GestureController | null = null;
  // Bumped on every teardown (destroy/route change) so in-flight async voice
  // work resolving into a stale world can detect it and self-cancel.
  private _generation = 0;
  // Set once destroy() finishes tearing down: from then on the annotator must
  // never write to storage or touch the DOM, no matter what resolves late.
  private _destroyed = false;
  private _activeVoice: ActiveVoice | null = null;
  private readonly _voiceLogger: Logger = {
    warn: (m, d) => console.warn(`[pinflow] ${m}`, d),
    error: (m, d) => console.error(`[pinflow] ${m}`, d),
  };

  constructor(deps: AnnotatorDeps) {
    this._deps = deps;
    this._ui = createUIRoot();
    this._store =
      loadStore(deps.storage, deps.config.project, deps.reviewer) ??
      emptyStore(deps.config.project, deps.reviewer);
    this._renderControl();
    this._renderPins();
    this._startGesture();
    window.addEventListener('resize', this._onReflow);
    window.addEventListener('scroll', this._onReflow, { passive: true });
  }

  destroy(): void {
    this._generation += 1;
    window.removeEventListener('resize', this._onReflow);
    window.removeEventListener('scroll', this._onReflow);
    this._gesture?.stop();
    // dispose() may synchronously best-effort persist an in-flight transcript,
    // so the destroyed flag flips only after voice teardown completes.
    this._teardownVoice();
    this._destroyed = true;
    this._closeActiveInput(false);
    if (this._annotating) this._exitAnnotateMode();
    if (this._reflowFrame) cancelAnimationFrame(this._reflowFrame);
    this._ui.destroy();
  }

  // Release any in-flight voice session and remove its dot. dispose() best-effort
  // persists already-committed transcript text (see session.ts).
  private _teardownVoice(): void {
    const v = this._activeVoice;
    if (!v) return;
    this._activeVoice = null;
    v.session?.dispose();
    v.mount.remove();
  }

  private _activationMode(): NonNullable<ActivationConfig['mode']> {
    return this._deps.config.activation?.mode ?? 'toggle';
  }

  // Stealth/both modes add a capture-phase long-press (touch) + Alt+click
  // (desktop) gesture that drops a comment without the visible control button.
  private _startGesture(): void {
    if (this._activationMode() === 'toggle') return;
    this._gesture = new GestureController({
      mode: this._activationMode(),
      longPressMs: this._deps.config.activation?.longPressMs ?? DEFAULT_LONG_PRESS_MS,
      moveThresholdPx: MOVE_THRESHOLD_PX,
      onActivate: (x, y, target) => this._placeCommentAt(x, y, target),
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

  private _persist(): void {
    this._invalidateViewCaches();
    saveStore(this._deps.storage, this._store);
  }

  private _invalidateViewCaches(): void {
    this._visibleCache = null;
    this._anchorCache.clear();
  }

  private _position(): PositionCorner {
    return (this._deps.config.position as PositionCorner) ?? 'bottom-right';
  }

  private _renderControl(): void {
    if (this._deps.config.hidden) return;
    // Stealth activation is invisible — no control button.
    if (this._activationMode() === 'stealth') return;
    const btn = el('button', 'control', this._controlLabel());
    btn.type = 'button';
    btn.dataset['active'] = 'false';
    const [v, h] = this._position().split('-') as ['bottom' | 'top', 'left' | 'right'];
    btn.style.setProperty(v, '16px');
    btn.style.setProperty(h, '16px');
    btn.addEventListener('click', () => this._togglePanel());
    this._ui.root.appendChild(btn);
    this._controlEl = btn;
  }

  private _controlLabel(): string {
    const count = this._visibleComments().length;
    if (this._deps.mode === 'builder') return `Pinflow • ${count}`;
    return count > 0 ? `Pinflow • ${count}` : 'Pinflow';
  }

  private _togglePanel(): void {
    if (this._panelEl) {
      this._closePanel();
      return;
    }
    this._panelEl =
      this._deps.mode === 'builder' ? this._renderBuilderPanel() : this._renderReviewerPanel();
    this._ui.root.appendChild(this._panelEl);
    this._positionPanel();
  }

  private _closePanel(): void {
    this._panelEl?.remove();
    this._panelEl = null;
  }

  // Anchor panel to the control and flip away from the nearest viewport edge
  // based on which corner the control sits in.
  private _positionPanel(): void {
    if (!this._panelEl) return;
    const rect = this._controlEl.getBoundingClientRect();
    const size = {
      width: this._panelEl.offsetWidth || 280,
      height: this._panelEl.offsetHeight || 180,
    };
    const vp = { width: window.innerWidth, height: window.innerHeight };
    const [v, h] = this._position().split('-') as ['bottom' | 'top', 'left' | 'right'];
    // Start anchored at the control; pick the edge that has room.
    const anchorLeft = h === 'left' ? rect.left : rect.right - size.width;
    const anchorTop = v === 'bottom' ? rect.top - size.height - 8 : rect.bottom + 8;
    place(this._panelEl, flipPosition({ left: anchorLeft, top: anchorTop }, size, vp, 0));
  }

  private _renderReviewerPanel(): HTMLDivElement {
    const count = this._store.comments.length;
    const panel = this._makePanel(
      `You have ${count} comment${count === 1 ? '' : 's'}`,
      'Click the button below, then tap any element on the page to pin a comment.',
      [
        this._makeButton(
          this._annotating ? 'Stop' : 'Add comment',
          () => this._toggleAnnotateMode(),
          'primary',
        ),
        this._makeButton('Export & share', () => void this._handleReviewerExport()),
      ],
    );
    if (this._deps.config.onSubmit) {
      const row2 = el('div', 'row');
      row2.style.marginTop = '8px';
      row2.appendChild(this._makeButton('Send to builder', () => void this._handleOnSubmit()));
      panel.appendChild(row2);
    }
    return panel;
  }

  // Built imperatively to keep reviewer names out of innerHTML.
  private _renderBuilderPanel(): HTMLDivElement {
    const drawer = el('div', 'drawer');
    const stores = loadAllStores(this._deps.storage, this._deps.config.project);
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
        label.appendChild(cb);
        label.appendChild(document.createTextNode(` ${s.reviewer} (${s.comments.length})`));
        drawer.appendChild(label);
      }
    }

    const bar = el('div', 'bar');
    bar.append(
      this._makeButton('Export all', () => void this._handleBuilderExport()),
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
    this._annotating = true;
    this._controlEl.dataset['active'] = 'true';
    document.addEventListener('click', this._onDocumentClick, true);
    document.addEventListener('keydown', this._onKeyDown);
    document.body.style.cursor = 'crosshair';
    this._closePanel();
  }

  private _exitAnnotateMode(): void {
    this._annotating = false;
    if (this._controlEl) this._controlEl.dataset['active'] = 'false';
    document.removeEventListener('click', this._onDocumentClick, true);
    document.removeEventListener('keydown', this._onKeyDown);
    document.body.style.cursor = '';
  }

  private _onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this._exitAnnotateMode();
  };

  private _onDocumentClick = (e: MouseEvent): void => {
    const target = e.target as Element | null;
    if (!target || this._ui.host.contains(target)) return;
    e.preventDefault();
    e.stopPropagation();
    this._exitAnnotateMode();
    this._placeCommentAt(e.clientX, e.clientY, target);
  };

  // Shared by the toggle click path and the stealth gesture: drop an anchored
  // note at a screen point. Voice-configured → a streaming voice dot; otherwise
  // the classic text input.
  private _placeCommentAt(clientX: number, clientY: number, target: Element): void {
    if (this._ui.host.contains(target)) return; // never annotate our own UI
    const anchor = buildAnchor(target, clientX, clientY);
    if (this._deps.config.voice) {
      if (this._activeVoice) return; // one recording at a time
      this._startVoiceDot(anchor, clientX, clientY);
      return;
    }
    this._commitTextComment(anchor, '', true);
  }

  // `route` defaults to the current route; the voice degrade path passes the
  // FROZEN route captured at dot creation (voice-contract.ts frozen-route rule).
  private _commitTextComment(
    anchor: Anchor,
    text: string,
    openForEdit: boolean,
    route = routeKey(),
  ): void {
    const t = now();
    const comment: Comment = {
      id: createId(),
      createdAt: t,
      updatedAt: t,
      route,
      fullUrl: window.location.href,
      text,
      modality: 'text',
      anchor,
    };
    this._store = upsertComment(this._store, comment);
    this._persist();
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

    const active: ActiveVoice = { mount, session: null };
    this._activeVoice = active;
    const myGen = this._generation;
    const route = routeKey();
    const host = this._buildVoiceHost(mount, anchor, route, active, myGen);

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
        fullUrl: window.location.href,
        text,
        modality: 'voice',
        voice,
        anchor,
      };
      this._store = upsertComment(this._store, comment);
      this._persist();
      mount.remove();
      this._renderPins();
    };
    return {
      config: this._deps.config.voice ?? {},
      mount,
      anchor,
      route,
      // destroy() guards: after teardown the world is gone — a late callback
      // must not write to storage or touch the DOM. (A same-tick commit during
      // destroy()'s own dispose() is still allowed — see destroy().)
      commit: ({ text, voice }) => {
        if (this._destroyed) return;
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
        this._commitTextComment(anchor, text, live, route);
      },
      logger: this._voiceLogger,
    };
  }

  // Memoized: the builder branch does a full localStorage key scan + parse of
  // every reviewer corpus — far too expensive for the per-frame reflow path.
  private _visibleComments(): Array<Comment & { reviewer?: string }> {
    if (this._visibleCache) return this._visibleCache;
    const route = routeKey();
    this._visibleCache =
      this._deps.mode === 'builder'
        ? loadAllStores(this._deps.storage, this._deps.config.project).flatMap((s) =>
            s.comments
              .filter((c) => c.route === route)
              .map((c) => ({ ...c, reviewer: s.reviewer })),
          )
        : this._store.comments.filter((c) => c.route === route);
    return this._visibleCache;
  }

  private _renderPins(): void {
    this._invalidateViewCaches();
    for (const el of this._pins.values()) el.remove();
    this._pins.clear();
    const comments = this._visibleComments();
    comments.forEach((c, i) => {
      const target = resolveAnchor(c.anchor);
      this._anchorCache.set(c.id, target);
      const pin = el('div', 'pin', String(i + 1));
      if (!target) pin.dataset['orphaned'] = 'true';
      if (c.reviewer) pin.title = c.reviewer;
      pin.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this._deps.mode === 'builder') return;
        this._openInput(c.id);
      });
      this._placePin(pin, c, target);
      this._ui.root.appendChild(pin);
      this._pins.set(c.id, pin);
    });
    if (this._controlEl) this._controlEl.textContent = this._controlLabel();
  }

  private _placePin(pin: HTMLDivElement, comment: Comment, target: Element | null): void {
    if (!target) {
      // Orphaned pin: park at last-known percentage within the viewport.
      const { positionPercent: p } = comment.anchor;
      place(pin, { left: (window.innerWidth * p.x) / 100, top: (window.innerHeight * p.y) / 100 });
      return;
    }
    place(pin, anchorToScreen(target, comment.anchor.positionPercent));
  }

  // Cheap path used on scroll/resize: just reposition existing pins, skipping
  // the querySelector + element-create cost of a full renderPins().
  private _repositionPins(): void {
    const byId = new Map(this._visibleComments().map((c) => [c.id, c]));
    for (const [id, pin] of this._pins) {
      const c = byId.get(id);
      if (c) this._placePin(pin, c, this._cachedAnchor(c));
    }
  }

  // Reflow path never re-runs the full selector ladder. A cached element that
  // left the DOM (host re-render) is re-resolved once and re-cached; an
  // orphaned (null) entry stays parked — its position can't change per frame.
  private _cachedAnchor(c: Comment): Element | null {
    const hit = this._anchorCache.get(c.id);
    if (hit === null || (hit !== undefined && hit.isConnected)) return hit;
    const el = resolveAnchor(c.anchor);
    this._anchorCache.set(c.id, el);
    return el;
  }

  private _openInput(commentId: string): void {
    this._closeActiveInput();
    const comment = this._store.comments.find((c) => c.id === commentId);
    if (!comment) return;
    const wrap = el('div', 'input');
    const ta = el('textarea');
    ta.placeholder = "What's on your mind?";
    ta.value = comment.text;
    ta.rows = 3;
    const actions = el('div', 'actions');
    const del = el('button', 'delete', 'Delete');
    del.type = 'button';
    actions.append(el('span', undefined, 'Auto-saves'), del);
    wrap.append(ta, actions);
    this._ui.root.appendChild(wrap);
    this._positionInputNearPin(wrap, commentId);

    const save = (): void => {
      window.clearTimeout(input.timer);
      input.timer = 0;
      if (this._destroyed) return; // a stray blur after teardown must not write
      // The comment may have been deleted while the debounce was armed —
      // saving then would resurrect it.
      const persisted = this._store.comments.find((c) => c.id === commentId);
      if (!persisted) return;
      // Hand-correcting a voice transcript flags the meta as edited (immutably).
      const voicePatch =
        persisted.voice && ta.value !== persisted.text
          ? { voice: { ...persisted.voice, edited: true } }
          : {};
      this._store = upsertComment(this._store, {
        ...persisted,
        text: ta.value,
        updatedAt: now(),
        ...voicePatch,
      });
      this._persist();
    };
    const input: ActiveInput = { wrap, commentId, timer: 0, flush: save };
    ta.addEventListener('input', () => {
      window.clearTimeout(input.timer);
      input.timer = window.setTimeout(save, 2000);
    });
    ta.addEventListener('blur', save);
    del.addEventListener('click', () => {
      this._store = deleteCommentFromStore(this._store, commentId);
      this._persist();
      this._closeActiveInput(false); // never flush a just-deleted comment
      this._renderPins();
    });
    ta.focus();
    this._activeInput = input;
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

  // Removing the textarea from the DOM does not reliably fire blur, so a
  // pending debounced save must be flushed here or up to 2s of typing is lost.
  // `flush=false` (delete/destroy) clears the timer without saving.
  private _closeActiveInput(flush = true): void {
    const input = this._activeInput;
    if (!input) return;
    this._activeInput = null;
    if (flush && input.timer) input.flush();
    else window.clearTimeout(input.timer);
    input.wrap.remove();
  }

  // Only classify comments on the current route — we can't tell if a comment
  // on another route would resolve without navigating there, so those stay
  // "live" conservatively (spec §5.2 intent: orphaned = element missing now).
  private _isOrphaned = (c: Comment): boolean => {
    if (c.route !== routeKey()) return false;
    return resolveAnchor(c.anchor) === null;
  };

  private async _handleReviewerExport(): Promise<void> {
    const meta = { generatedAt: now(), project: this._deps.config.project };
    const md = exportReviewer(this._store, meta, this._isOrphaned);
    const filename = exportFilename(
      this._deps.config.project,
      this._store.reviewer,
      meta.generatedAt,
    );
    downloadMarkdown(md, filename);
    const copied = await copyToClipboard(md);
    this._showConfirmation(copied);
  }

  private async _handleBuilderExport(): Promise<void> {
    const stores = loadAllStores(this._deps.storage, this._deps.config.project);
    const meta = { generatedAt: now(), project: this._deps.config.project };
    const md = exportBuilder(stores, meta, this._isOrphaned);
    const filename = exportFilename(this._deps.config.project, null, meta.generatedAt);
    downloadMarkdown(md, filename);
    await copyToClipboard(md);
  }

  // Spec §5.6: after reviewer export, show a small confirmation panel
  // suggesting any share channel, rather than closing silently.
  private _showConfirmation(copied: boolean): void {
    this._closePanel();
    const panel = this._makePanel(
      'Saved to your downloads',
      copied
        ? 'Copied to clipboard too. Share however you like — email, Slack, paste into a chat.'
        : 'Share however you like — email, Slack, paste into a chat.',
      [this._makeButton('Done', () => this._closePanel())],
    );
    this._panelEl = panel;
    this._ui.root.appendChild(panel);
    this._positionPanel();
  }

  private _handleBuilderClear(): void {
    if (!window.confirm('Clear all comments for this project from this browser?')) return;
    clearProject(this._deps.storage, this._deps.config.project);
    this._renderPins();
    this._closePanel();
  }

  private async _handleOnSubmit(): Promise<void> {
    if (!this._deps.config.onSubmit) return;
    await this._deps.config.onSubmit(this._store);
  }
}
