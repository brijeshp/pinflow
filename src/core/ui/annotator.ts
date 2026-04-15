import { anchorToScreen, buildAnchor, resolveAnchor } from '../anchor';
import { copyToClipboard, downloadMarkdown } from '../download';
import { exportBuilder, exportFilename, exportReviewer } from '../export';
import { createId } from '../id';
import {
  deleteComment as deleteCommentFromStore,
  emptyStore,
  loadAllStores,
  loadStore,
  saveStore,
  upsertComment,
} from '../storage';
import type { Comment, Mode, PinflowConfig, ReviewerStore } from '../types';
import { createUIRoot, flipPosition, type UIRoot } from './dom';

interface AnnotatorDeps {
  config: Required<Pick<PinflowConfig, 'project'>> & PinflowConfig;
  reviewer: string;
  mode: Mode;
  onRouteChange?: (route: string) => void;
  storage: Storage;
}

export class Annotator {
  private readonly ui: UIRoot;
  private readonly deps: AnnotatorDeps;
  private store: ReviewerStore;
  private annotating = false;
  private pins = new Map<string, HTMLDivElement>();
  private activeInput: { wrap: HTMLDivElement; commentId: string } | null = null;
  private controlEl!: HTMLButtonElement;
  private panelEl: HTMLDivElement | null = null;

  constructor(deps: AnnotatorDeps) {
    this.deps = deps;
    this.ui = createUIRoot();
    this.store =
      loadStore(deps.storage, deps.config.project, deps.reviewer) ??
      emptyStore(deps.config.project, deps.reviewer);
    this.renderControl();
    this.renderPins();
    window.addEventListener('resize', this.onReflow);
    window.addEventListener('scroll', this.onReflow, { passive: true });
  }

  destroy(): void {
    window.removeEventListener('resize', this.onReflow);
    window.removeEventListener('scroll', this.onReflow);
    this.ui.destroy();
  }

  refreshRoute(): void {
    this.renderPins();
  }

  private onReflow = (): void => {
    this.renderPins(true);
  };

  private persist(): void {
    saveStore(this.deps.storage, this.store);
  }

  private renderControl(): void {
    if (this.deps.config.hidden) return;
    const btn = document.createElement('button');
    btn.className = 'control';
    btn.type = 'button';
    btn.dataset['active'] = 'false';
    const pos = this.deps.config.position ?? 'bottom-right';
    const [v, h] = pos.split('-');
    btn.style.setProperty(v as 'bottom' | 'top', '16px');
    btn.style.setProperty(h as 'left' | 'right', '16px');
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
      this.panelEl.remove();
      this.panelEl = null;
      return;
    }
    this.panelEl =
      this.deps.mode === 'builder' ? this.renderBuilderPanel() : this.renderReviewerPanel();
    this.ui.root.appendChild(this.panelEl);
    this.positionPanel();
  }

  private positionPanel(): void {
    if (!this.panelEl) return;
    const rect = this.controlEl.getBoundingClientRect();
    const size = {
      width: this.panelEl.offsetWidth || 280,
      height: this.panelEl.offsetHeight || 180,
    };
    const vp = { width: window.innerWidth, height: window.innerHeight };
    const anchor = { left: rect.left, top: rect.top - size.height - 8 };
    const pos = flipPosition(anchor, size, vp);
    this.panelEl.style.left = `${pos.left}px`;
    this.panelEl.style.top = `${pos.top}px`;
  }

  private renderReviewerPanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.className = 'panel';
    const count = this.store.comments.length;
    panel.innerHTML = `
      <h3>You have ${count} comment${count === 1 ? '' : 's'}</h3>
      <p>Click the button below, then tap any element on the page to pin a comment.</p>
      <div class="row">
        <button type="button" class="primary" data-act="annotate">${this.annotating ? 'Stop' : 'Add comment'}</button>
        <button type="button" data-act="export">Export & share</button>
      </div>
    `;
    if (this.deps.config.onSubmit) {
      panel.insertAdjacentHTML(
        'beforeend',
        '<div class="row" style="margin-top:8px"><button type="button" data-act="submit">Send to builder</button></div>',
      );
    }
    panel.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest('button')?.dataset['act'];
      if (act === 'annotate') this.toggleAnnotateMode();
      if (act === 'export') this.handleReviewerExport();
      if (act === 'submit') this.handleOnSubmit();
    });
    return panel;
  }

  private renderBuilderPanel(): HTMLDivElement {
    const drawer = document.createElement('div');
    drawer.className = 'drawer';
    const stores = loadAllStores(this.deps.storage, this.deps.config.project);
    const reviewers = stores.map((s) => ({
      name: s.reviewer,
      count: s.comments.length,
    }));
    drawer.innerHTML = `
      <h3>Builder mode</h3>
      ${reviewers
        .map(
          (r) =>
            `<label><input type="checkbox" data-reviewer="${r.name}" checked> ${r.name} (${r.count})</label>`,
        )
        .join('')}
      <div class="bar">
        <button type="button" data-act="export">Export all</button>
        <button type="button" class="danger" data-act="clear">Clear all</button>
      </div>
    `;
    drawer.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest('button')?.dataset['act'];
      if (act === 'export') this.handleBuilderExport();
      if (act === 'clear') this.handleBuilderClear();
    });
    return drawer;
  }

  private toggleAnnotateMode(): void {
    this.annotating = !this.annotating;
    this.controlEl.dataset['active'] = String(this.annotating);
    if (this.annotating) {
      document.addEventListener('click', this.onDocumentClick, true);
      document.body.style.cursor = 'crosshair';
    } else {
      document.removeEventListener('click', this.onDocumentClick, true);
      document.body.style.cursor = '';
    }
    if (this.panelEl) {
      this.panelEl.remove();
      this.panelEl = null;
    }
  }

  private onDocumentClick = (e: MouseEvent): void => {
    const target = e.target as Element | null;
    if (!target || this.ui.host.contains(target)) return;
    e.preventDefault();
    e.stopPropagation();
    const anchor = buildAnchor(target, e.clientX, e.clientY);
    const route = window.location.pathname + window.location.search;
    const now = new Date().toISOString();
    const comment: Comment = {
      id: createId(),
      createdAt: now,
      updatedAt: now,
      route,
      fullUrl: window.location.href,
      text: '',
      anchor,
    };
    this.store = upsertComment(this.store, comment);
    this.persist();
    this.renderPins();
    this.toggleAnnotateMode();
    this.openInput(comment.id);
  };

  private visibleComments(): Array<Comment & { reviewer?: string }> {
    const route = window.location.pathname + window.location.search;
    if (this.deps.mode === 'builder') {
      const stores = loadAllStores(this.deps.storage, this.deps.config.project);
      return stores.flatMap((s) =>
        s.comments.filter((c) => c.route === route).map((c) => ({ ...c, reviewer: s.reviewer })),
      );
    }
    return this.store.comments.filter((c) => c.route === route);
  }

  private renderPins(quiet = false): void {
    for (const el of this.pins.values()) el.remove();
    this.pins.clear();
    const comments = this.visibleComments();
    comments.forEach((c, i) => {
      const target = resolveAnchor(c.anchor);
      if (!target) return;
      const screen = anchorToScreen(target, c.anchor.positionPercent);
      const pin = document.createElement('div');
      pin.className = 'pin';
      pin.textContent = String(i + 1);
      pin.style.left = `${screen.left}px`;
      pin.style.top = `${screen.top}px`;
      if (c.reviewer) pin.title = c.reviewer;
      pin.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.deps.mode === 'builder') return;
        this.openInput(c.id);
      });
      this.ui.root.appendChild(pin);
      this.pins.set(c.id, pin);
    });
    if (!quiet && this.controlEl) this.controlEl.textContent = this.controlLabel();
  }

  private openInput(commentId: string): void {
    if (this.activeInput) this.activeInput.wrap.remove();
    const comment = this.store.comments.find((c) => c.id === commentId);
    if (!comment) return;
    const pin = this.pins.get(commentId);
    const wrap = document.createElement('div');
    wrap.className = 'input';
    const ta = document.createElement('textarea');
    ta.placeholder = "What's on your mind?";
    ta.value = comment.text;
    ta.rows = 3;
    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.innerHTML = '<span>Auto-saves</span><button type="button" class="delete">Delete</button>';
    wrap.appendChild(ta);
    wrap.appendChild(actions);
    this.ui.root.appendChild(wrap);
    if (pin) {
      const pr = pin.getBoundingClientRect();
      const pos = flipPosition(
        { left: pr.right, top: pr.top },
        { width: 280, height: 120 },
        { width: window.innerWidth, height: window.innerHeight },
      );
      wrap.style.left = `${pos.left}px`;
      wrap.style.top = `${pos.top}px`;
    }
    let debounce: number | undefined;
    const save = () => {
      this.store = upsertComment(this.store, {
        ...comment,
        text: ta.value,
        updatedAt: new Date().toISOString(),
      });
      this.persist();
    };
    ta.addEventListener('input', () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(save, 2000);
    });
    ta.addEventListener('blur', save);
    actions.querySelector('.delete')?.addEventListener('click', () => {
      this.store = deleteCommentFromStore(this.store, commentId);
      this.persist();
      wrap.remove();
      this.activeInput = null;
      this.renderPins();
    });
    ta.focus();
    this.activeInput = { wrap, commentId };
  }

  private async handleReviewerExport(): Promise<void> {
    const meta = { generatedAt: new Date().toISOString(), project: this.deps.config.project };
    const md = exportReviewer(this.store, meta);
    const filename = exportFilename('reviewer', this.deps.config.project, this.store.reviewer, meta.generatedAt);
    downloadMarkdown(md, filename);
    await copyToClipboard(md);
  }

  private async handleBuilderExport(): Promise<void> {
    const stores = loadAllStores(this.deps.storage, this.deps.config.project);
    const meta = { generatedAt: new Date().toISOString(), project: this.deps.config.project };
    const md = exportBuilder(stores, meta);
    const filename = exportFilename('builder', this.deps.config.project, null, meta.generatedAt);
    downloadMarkdown(md, filename);
    await copyToClipboard(md);
  }

  private handleBuilderClear(): void {
    if (!window.confirm('Clear all comments for this project from this browser?')) return;
    for (const s of loadAllStores(this.deps.storage, this.deps.config.project)) {
      this.deps.storage.removeItem(`pinflow:${this.deps.config.project}:${s.reviewer}`);
    }
    this.renderPins();
    if (this.panelEl) {
      this.panelEl.remove();
      this.panelEl = null;
    }
  }

  private async handleOnSubmit(): Promise<void> {
    if (!this.deps.config.onSubmit) return;
    await this.deps.config.onSubmit(this.store);
  }
}
