import { anchorToScreen, buildAnchor, resolveAnchor } from '../anchor';
import { copyToClipboard, downloadMarkdown } from '../download';
import { exportBuilder, exportFilename, exportReviewer } from '../export';
import { createId } from '../id';
import { now } from '../time';
import { routeKey } from '../route-key';
import {
  deleteComment as deleteCommentFromStore,
  emptyStore,
  loadAllStores,
  loadStore,
  saveStore,
  storageKey,
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
import { createUIRoot, flipPosition, type UIRoot } from './dom';

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

type PositionCorner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

export class Annotator {
  private readonly ui: UIRoot;
  private readonly deps: AnnotatorDeps;
  private store: ReviewerStore;
  private annotating = false;
  private pins = new Map<string, HTMLDivElement>();
  private activeInput: { wrap: HTMLDivElement; commentId: string } | null = null;
  private controlEl!: HTMLButtonElement;
  private panelEl: HTMLDivElement | null = null;
  private reflowFrame = 0;
  private gesture: GestureController | null = null;
  // Bumped on every teardown (destroy/route change) so in-flight async voice
  // work resolving into a stale world can detect it and self-cancel.
  private generation = 0;
  private activeVoice: ActiveVoice | null = null;
  private readonly voiceLogger: Logger = {
    warn: (m, d) => console.warn(`[pinflow] ${m}`, d),
    error: (m, d) => console.error(`[pinflow] ${m}`, d),
  };

  constructor(deps: AnnotatorDeps) {
    this.deps = deps;
    this.ui = createUIRoot();
    this.store =
      loadStore(deps.storage, deps.config.project, deps.reviewer) ??
      emptyStore(deps.config.project, deps.reviewer);
    this.renderControl();
    this.renderPins();
    this.startGesture();
    window.addEventListener('resize', this.onReflow);
    window.addEventListener('scroll', this.onReflow, { passive: true });
  }

  destroy(): void {
    this.generation += 1;
    window.removeEventListener('resize', this.onReflow);
    window.removeEventListener('scroll', this.onReflow);
    this.gesture?.stop();
    this.teardownVoice();
    if (this.annotating) this.exitAnnotateMode();
    if (this.reflowFrame) cancelAnimationFrame(this.reflowFrame);
    this.ui.destroy();
  }

  // Release any in-flight voice session and remove its dot. dispose() best-effort
  // persists already-committed transcript text (see session.ts).
  private teardownVoice(): void {
    const v = this.activeVoice;
    if (!v) return;
    this.activeVoice = null;
    v.session?.dispose();
    v.mount.remove();
  }

  private activationMode(): NonNullable<ActivationConfig['mode']> {
    return this.deps.config.activation?.mode ?? 'toggle';
  }

  // Stealth/both modes add a capture-phase long-press (touch) + Alt+click
  // (desktop) gesture that drops a comment without the visible control button.
  private startGesture(): void {
    if (this.activationMode() === 'toggle') return;
    this.gesture = new GestureController({
      mode: this.activationMode(),
      longPressMs: this.deps.config.activation?.longPressMs ?? DEFAULT_LONG_PRESS_MS,
      moveThresholdPx: MOVE_THRESHOLD_PX,
      onActivate: (x, y, target) => this.placeCommentAt(x, y, target),
    });
    this.gesture.start();
  }

  refreshRoute(): void {
    this.generation += 1;
    // A recording in progress finalizes and persists to its FROZEN route (the
    // host captured the route at dot creation), then the dot is removed.
    const v = this.activeVoice;
    if (v) {
      this.activeVoice = null;
      const mount = v.mount;
      void Promise.resolve(v.session?.stop()).finally(() => mount.remove());
    }
    this.closeActiveInput();
    this.renderPins();
  }

  // Scroll/resize only moves existing pins — it never adds or removes them.
  // Re-creating DOM on every scroll frame caused jank; instead, rAF-throttle
  // and just translate existing pin elements.
  private onReflow = (): void => {
    if (this.reflowFrame) return;
    this.reflowFrame = requestAnimationFrame(() => {
      this.reflowFrame = 0;
      this.repositionPins();
      if (this.panelEl) this.positionPanel();
      if (this.activeInput)
        this.positionInputNearPin(this.activeInput.wrap, this.activeInput.commentId);
    });
  };

  private persist(): void {
    saveStore(this.deps.storage, this.store);
  }

  private position(): PositionCorner {
    return (this.deps.config.position as PositionCorner) ?? 'bottom-right';
  }

  private renderControl(): void {
    if (this.deps.config.hidden) return;
    // Stealth activation is invisible — no control button.
    if (this.activationMode() === 'stealth') return;
    const btn = document.createElement('button');
    btn.className = 'control';
    btn.type = 'button';
    btn.dataset['active'] = 'false';
    const [v, h] = this.position().split('-') as ['bottom' | 'top', 'left' | 'right'];
    btn.style.setProperty(v, '16px');
    btn.style.setProperty(h, '16px');
    btn.textContent = this.controlLabel();
    btn.addEventListener('click', () => this.togglePanel());
    this.ui.root.appendChild(btn);
    this.controlEl = btn;
  }

  private controlLabel(): string {
    const count = this.visibleComments().length;
    if (this.deps.mode === 'builder') return `Pinflow • ${count}`;
    return count > 0 ? `Pinflow • ${count}` : 'Pinflow';
  }

  private togglePanel(): void {
    if (this.panelEl) {
      this.closePanel();
      return;
    }
    this.panelEl =
      this.deps.mode === 'builder' ? this.renderBuilderPanel() : this.renderReviewerPanel();
    this.ui.root.appendChild(this.panelEl);
    this.positionPanel();
  }

  private closePanel(): void {
    this.panelEl?.remove();
    this.panelEl = null;
  }

  // Anchor panel to the control and flip away from the nearest viewport edge
  // based on which corner the control sits in.
  private positionPanel(): void {
    if (!this.panelEl) return;
    const rect = this.controlEl.getBoundingClientRect();
    const size = {
      width: this.panelEl.offsetWidth || 280,
      height: this.panelEl.offsetHeight || 180,
    };
    const vp = { width: window.innerWidth, height: window.innerHeight };
    const [v, h] = this.position().split('-') as ['bottom' | 'top', 'left' | 'right'];
    // Start anchored at the control; pick the edge that has room.
    const anchorLeft = h === 'left' ? rect.left : rect.right - size.width;
    const anchorTop = v === 'bottom' ? rect.top - size.height - 8 : rect.bottom + 8;
    const pos = flipPosition({ left: anchorLeft, top: anchorTop }, size, vp, 0);
    this.panelEl.style.left = `${pos.left}px`;
    this.panelEl.style.top = `${pos.top}px`;
  }

  private renderReviewerPanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.className = 'panel';
    const count = this.store.comments.length;
    const h3 = document.createElement('h3');
    h3.textContent = `You have ${count} comment${count === 1 ? '' : 's'}`;
    const p = document.createElement('p');
    p.textContent = 'Click the button below, then tap any element on the page to pin a comment.';
    const row = document.createElement('div');
    row.className = 'row';
    const annotateBtn = this.makeButton(
      this.annotating ? 'Stop' : 'Add comment',
      'annotate',
      'primary',
    );
    const exportBtn = this.makeButton('Export & share', 'export');
    row.append(annotateBtn, exportBtn);
    panel.append(h3, p, row);
    if (this.deps.config.onSubmit) {
      const row2 = document.createElement('div');
      row2.className = 'row';
      row2.style.marginTop = '8px';
      row2.appendChild(this.makeButton('Send to builder', 'submit'));
      panel.appendChild(row2);
    }
    panel.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest('button')?.dataset['act'];
      if (act === 'annotate') this.toggleAnnotateMode();
      if (act === 'export') this.handleReviewerExport();
      if (act === 'submit') this.handleOnSubmit();
    });
    return panel;
  }

  // Built imperatively to keep reviewer names out of innerHTML.
  private renderBuilderPanel(): HTMLDivElement {
    const drawer = document.createElement('div');
    drawer.className = 'drawer';
    const stores = loadAllStores(this.deps.storage, this.deps.config.project);

    const h3 = document.createElement('h3');
    h3.textContent = 'Builder mode';
    drawer.appendChild(h3);

    if (stores.length === 0) {
      const empty = document.createElement('p');
      empty.textContent = 'No comments yet.';
      empty.style.opacity = '0.7';
      drawer.appendChild(empty);
    } else {
      for (const s of stores) {
        const label = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = true;
        cb.dataset['reviewer'] = s.reviewer;
        label.appendChild(cb);
        label.appendChild(document.createTextNode(` ${s.reviewer} (${s.comments.length})`));
        drawer.appendChild(label);
      }
    }

    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.appendChild(this.makeButton('Export all', 'export'));
    const clear = this.makeButton('Clear all', 'clear', 'danger');
    bar.appendChild(clear);
    drawer.appendChild(bar);

    drawer.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest('button')?.dataset['act'];
      if (act === 'export') this.handleBuilderExport();
      if (act === 'clear') this.handleBuilderClear();
    });
    return drawer;
  }

  private makeButton(
    label: string,
    act: string,
    variant?: 'primary' | 'danger',
  ): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset['act'] = act;
    if (variant) b.className = variant;
    b.textContent = label;
    return b;
  }

  private toggleAnnotateMode(): void {
    if (this.annotating) this.exitAnnotateMode();
    else this.enterAnnotateMode();
  }

  private enterAnnotateMode(): void {
    this.annotating = true;
    this.controlEl.dataset['active'] = 'true';
    document.addEventListener('click', this.onDocumentClick, true);
    document.addEventListener('keydown', this.onKeyDown);
    document.body.style.cursor = 'crosshair';
    this.closePanel();
  }

  private exitAnnotateMode(): void {
    this.annotating = false;
    if (this.controlEl) this.controlEl.dataset['active'] = 'false';
    document.removeEventListener('click', this.onDocumentClick, true);
    document.removeEventListener('keydown', this.onKeyDown);
    document.body.style.cursor = '';
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.exitAnnotateMode();
  };

  private onDocumentClick = (e: MouseEvent): void => {
    const target = e.target as Element | null;
    if (!target || this.ui.host.contains(target)) return;
    e.preventDefault();
    e.stopPropagation();
    this.exitAnnotateMode();
    this.placeCommentAt(e.clientX, e.clientY, target);
  };

  // Shared by the toggle click path and the stealth gesture: drop an anchored
  // note at a screen point. Voice-configured → a streaming voice dot; otherwise
  // the classic text input.
  private placeCommentAt(clientX: number, clientY: number, target: Element): void {
    if (this.ui.host.contains(target)) return; // never annotate our own UI
    const anchor = buildAnchor(target, clientX, clientY);
    if (this.deps.config.voice) {
      if (this.activeVoice) return; // one recording at a time
      this.startVoiceDot(anchor, clientX, clientY);
      return;
    }
    this.commitTextComment(anchor, '', true);
  }

  private commitTextComment(anchor: Anchor, text: string, openForEdit: boolean): void {
    const t = now();
    const comment: Comment = {
      id: createId(),
      createdAt: t,
      updatedAt: t,
      route: routeKey(),
      fullUrl: window.location.href,
      text,
      modality: 'text',
      anchor,
    };
    this.store = upsertComment(this.store, comment);
    this.persist();
    this.renderPins();
    if (openForEdit) this.openInput(comment.id);
  }

  private loadVoiceModule(): Promise<VoiceModule> {
    return (this.deps.loadVoice ?? defaultLoadVoice)();
  }

  // Drop a voice dot, lazily load the voice module, and start a session — with
  // generation guards so an import/start resolving after teardown self-cancels
  // and releases whatever it produced.
  private startVoiceDot(anchor: Anchor, clientX: number, clientY: number): void {
    const mount = document.createElement('div');
    mount.style.cssText = 'position:fixed;';
    const pos = flipPosition(
      { left: clientX, top: clientY },
      { width: 280, height: 140 },
      { width: window.innerWidth, height: window.innerHeight },
    );
    mount.style.left = `${pos.left}px`;
    mount.style.top = `${pos.top}px`;
    this.ui.root.appendChild(mount);

    const active: ActiveVoice = { mount, session: null };
    this.activeVoice = active;
    const myGen = this.generation;
    const route = routeKey();
    const host = this.buildVoiceHost(mount, anchor, route, active);

    this.loadVoiceModule()
      .then((mod) => {
        if (myGen !== this.generation) {
          mount.remove();
          return;
        }
        return mod.start(host).then((session) => {
          if (myGen !== this.generation) {
            session.dispose();
            mount.remove();
            return;
          }
          active.session = session;
        });
      })
      .catch((err) => {
        this.voiceLogger.warn('voice module failed to load', err);
        if (myGen === this.generation) host.degradeToText();
      });
  }

  private buildVoiceHost(
    mount: HTMLDivElement,
    anchor: Anchor,
    route: string,
    active: ActiveVoice,
  ): VoiceHost {
    const commitVoice = (text: string, voice: VoiceMeta): void => {
      if (this.activeVoice === active) this.activeVoice = null;
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
      this.store = upsertComment(this.store, comment);
      this.persist();
      mount.remove();
      this.renderPins();
    };
    return {
      config: this.deps.config.voice ?? {},
      mount,
      anchor,
      route,
      commit: ({ text, voice }) => commitVoice(text, voice),
      discard: () => {
        if (this.activeVoice === active) this.activeVoice = null;
        mount.remove();
      },
      degradeToText: (prefill) => {
        if (this.activeVoice === active) this.activeVoice = null;
        mount.remove();
        this.commitTextComment(anchor, prefill ?? '', true);
      },
      logger: this.voiceLogger,
    };
  }

  private visibleComments(): Array<Comment & { reviewer?: string }> {
    const route = routeKey();
    if (this.deps.mode === 'builder') {
      const stores = loadAllStores(this.deps.storage, this.deps.config.project);
      return stores.flatMap((s) =>
        s.comments.filter((c) => c.route === route).map((c) => ({ ...c, reviewer: s.reviewer })),
      );
    }
    return this.store.comments.filter((c) => c.route === route);
  }

  private renderPins(): void {
    for (const el of this.pins.values()) el.remove();
    this.pins.clear();
    const comments = this.visibleComments();
    comments.forEach((c, i) => {
      const target = resolveAnchor(c.anchor);
      const pin = document.createElement('div');
      pin.className = 'pin';
      pin.textContent = String(i + 1);
      if (!target) pin.dataset['orphaned'] = 'true';
      if (c.reviewer) pin.title = c.reviewer;
      pin.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.deps.mode === 'builder') return;
        this.openInput(c.id);
      });
      this.placePin(pin, c, target);
      this.ui.root.appendChild(pin);
      this.pins.set(c.id, pin);
    });
    if (this.controlEl) this.controlEl.textContent = this.controlLabel();
  }

  private placePin(pin: HTMLDivElement, comment: Comment, target: Element | null): void {
    if (!target) {
      // Orphaned pin: park at last-known percentage within the viewport.
      const { positionPercent: p } = comment.anchor;
      pin.style.left = `${(window.innerWidth * p.x) / 100}px`;
      pin.style.top = `${(window.innerHeight * p.y) / 100}px`;
      return;
    }
    const { left, top } = anchorToScreen(target, comment.anchor.positionPercent);
    pin.style.left = `${left}px`;
    pin.style.top = `${top}px`;
  }

  // Cheap path used on scroll/resize: just reposition existing pins, skipping
  // the querySelector + element-create cost of a full renderPins().
  private repositionPins(): void {
    const byId = new Map(this.visibleComments().map((c) => [c.id, c]));
    for (const [id, pin] of this.pins) {
      const c = byId.get(id);
      if (c) this.placePin(pin, c, resolveAnchor(c.anchor));
    }
  }

  private openInput(commentId: string): void {
    this.closeActiveInput();
    const comment = this.store.comments.find((c) => c.id === commentId);
    if (!comment) return;
    const wrap = document.createElement('div');
    wrap.className = 'input';
    const ta = document.createElement('textarea');
    ta.placeholder = "What's on your mind?";
    ta.value = comment.text;
    ta.rows = 3;
    const actions = document.createElement('div');
    actions.className = 'actions';
    const hint = document.createElement('span');
    hint.textContent = 'Auto-saves';
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'delete';
    del.textContent = 'Delete';
    actions.append(hint, del);
    wrap.append(ta, actions);
    this.ui.root.appendChild(wrap);
    this.positionInputNearPin(wrap, commentId);

    let debounce: number | undefined;
    const save = (): void => {
      this.store = upsertComment(this.store, {
        ...comment,
        text: ta.value,
        updatedAt: now(),
      });
      this.persist();
    };
    ta.addEventListener('input', () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(save, 2000);
    });
    ta.addEventListener('blur', save);
    del.addEventListener('click', () => {
      this.store = deleteCommentFromStore(this.store, commentId);
      this.persist();
      this.closeActiveInput();
      this.renderPins();
    });
    ta.focus();
    this.activeInput = { wrap, commentId };
  }

  private positionInputNearPin(wrap: HTMLDivElement, commentId: string): void {
    const pin = this.pins.get(commentId);
    if (!pin) return;
    const pr = pin.getBoundingClientRect();
    const pos = flipPosition(
      { left: pr.right, top: pr.top },
      { width: wrap.offsetWidth || 280, height: wrap.offsetHeight || 120 },
      { width: window.innerWidth, height: window.innerHeight },
    );
    wrap.style.left = `${pos.left}px`;
    wrap.style.top = `${pos.top}px`;
  }

  private closeActiveInput(): void {
    this.activeInput?.wrap.remove();
    this.activeInput = null;
  }

  // Only classify comments on the current route — we can't tell if a comment
  // on another route would resolve without navigating there, so those stay
  // "live" conservatively (spec §5.2 intent: orphaned = element missing now).
  private isOrphaned = (c: Comment): boolean => {
    if (c.route !== routeKey()) return false;
    return resolveAnchor(c.anchor) === null;
  };

  private async handleReviewerExport(): Promise<void> {
    const meta = { generatedAt: now(), project: this.deps.config.project };
    const md = exportReviewer(this.store, meta, { isOrphaned: this.isOrphaned });
    const filename = exportFilename(
      'reviewer',
      this.deps.config.project,
      this.store.reviewer,
      meta.generatedAt,
    );
    downloadMarkdown(md, filename);
    const copied = await copyToClipboard(md);
    this.showConfirmation(copied);
  }

  private async handleBuilderExport(): Promise<void> {
    const stores = loadAllStores(this.deps.storage, this.deps.config.project);
    const meta = { generatedAt: now(), project: this.deps.config.project };
    const md = exportBuilder(stores, meta, { isOrphaned: this.isOrphaned });
    const filename = exportFilename('builder', this.deps.config.project, null, meta.generatedAt);
    downloadMarkdown(md, filename);
    await copyToClipboard(md);
  }

  // Spec §5.6: after reviewer export, show a small confirmation panel
  // suggesting any share channel, rather than closing silently.
  private showConfirmation(copied: boolean): void {
    this.closePanel();
    const panel = document.createElement('div');
    panel.className = 'panel';
    const h3 = document.createElement('h3');
    h3.textContent = 'Saved to your downloads';
    const p = document.createElement('p');
    p.textContent = copied
      ? 'Copied to clipboard too. Share however you like — email, Slack, paste into a chat.'
      : 'Share however you like — email, Slack, paste into a chat.';
    const row = document.createElement('div');
    row.className = 'row';
    row.appendChild(this.makeButton('Done', 'done'));
    panel.append(h3, p, row);
    panel.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest('button')?.dataset['act'];
      if (act === 'done') this.closePanel();
    });
    this.panelEl = panel;
    this.ui.root.appendChild(panel);
    this.positionPanel();
  }

  private handleBuilderClear(): void {
    if (!window.confirm('Clear all comments for this project from this browser?')) return;
    for (const s of loadAllStores(this.deps.storage, this.deps.config.project)) {
      this.deps.storage.removeItem(storageKey(this.deps.config.project, s.reviewer));
    }
    this.renderPins();
    this.closePanel();
  }

  private async handleOnSubmit(): Promise<void> {
    if (!this.deps.config.onSubmit) return;
    await this.deps.config.onSubmit(this.store);
  }
}
