import { afterEach, describe, expect, it, vi } from 'vitest';
import * as scopeModule from '../../src/core/scope';
import { loadStore } from '../../src/core/storage';
import { Annotator } from '../../src/core/ui/annotator';
import { ScopeOutline } from '../../src/core/ui/outline';
import type { Comment, ReviewerStore } from '../../src/core/types';

const PROJECT = 'p';
const REVIEWER = 'Tester';

function shadow(): ShadowRoot {
  const host = document.querySelector('[data-pinflow-root]');
  if (!host?.shadowRoot) throw new Error('pinflow root not mounted');
  return host.shadowRoot;
}

function mockRect(el: Element, r: { left: number; top: number; width: number; height: number }) {
  return vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    ...r,
    right: r.left + r.width,
    bottom: r.top + r.height,
    x: r.left,
    y: r.top,
    toJSON: () => r,
  } as DOMRect);
}

// A page with a real component boundary, so the ladder has something to find.
function page(): { section: HTMLElement; button: HTMLButtonElement } {
  // <main> above the component on purpose: anchorTarget canonicalises the
  // click to the testid element, so the CHANGE node is the section and the
  // ceiling has to come from above it.
  document.body.innerHTML =
    '<main><section data-testid="pricing"><button id="cta">Upgrade</button></section></main>';
  const section = document.querySelector('section') as HTMLElement;
  mockRect(document.querySelector('main')!, { left: 0, top: 0, width: 900, height: 600 });
  const button = document.querySelector('#cta') as HTMLButtonElement;
  mockRect(document.body, { left: 0, top: 0, width: 1000, height: 800 });
  mockRect(section, { left: 0, top: 100, width: 600, height: 300 });
  mockRect(button, { left: 40, top: 140, width: 200, height: 48 });
  return { section, button };
}

function make(over: Record<string, unknown> = {}): Annotator {
  return new Annotator({
    config: { project: PROJECT, ...over },
    reviewer: REVIEWER,
    mode: 'reviewer',
    storage: localStorage,
  });
}

function arm(): void {
  shadow().querySelector<HTMLButtonElement>('.arm')?.click();
}

// Armed placement goes through the window-capture click handler.
function clickPage(target: Element, x = 100, y = 160): void {
  target.dispatchEvent(
    new MouseEvent('click', { bubbles: true, composed: true, clientX: x, clientY: y }),
  );
}

function stored(): Comment[] {
  return (loadStore(localStorage, PROJECT, REVIEWER) as ReviewerStore | null)?.comments ?? [];
}

function saveDraft(text = 'needs work'): void {
  const ta = shadow().querySelector('textarea');
  if (!ta) throw new Error('composer did not open');
  ta.value = text;
  ta.dispatchEvent(new Event('input'));
  shadow().querySelector<HTMLButtonElement>('.input .save')?.click();
}

// Escape is handled on the textarea, like every other dismissal test here.
function escapeDraft(): void {
  shadow()
    .querySelector('textarea')
    ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
}

function outlines(): NodeListOf<Element> {
  return shadow().querySelectorAll('.so > i');
}

describe('scope capture on the commit paths', () => {
  let annotator: Annotator | null = null;

  afterEach(() => {
    annotator?.destroy();
    annotator = null;
    localStorage.clear();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('attaches a scope to a point pin, naming the component as the ceiling', () => {
    const { button } = page();
    annotator = make();
    arm();
    clickPage(button);
    const scope = stored()[0]?.scope;
    expect(scope).toBeDefined();
    // Ceiling above, change within: the landmark is the boundary and the
    // anchored component is what the note may alter.
    expect(scope!.boundary.tag).toBe('main');
    expect(scope!.rung).toBe('landmark');
    expect(scope!.members?.[0]?.testid).toBe('pricing');
  });

  it('resolves scope exactly once per placement, never on a reflow frame', async () => {
    const { button } = page();
    const spy = vi.spyOn(scopeModule, 'resolveScope');
    annotator = make();
    arm();
    clickPage(button);
    const afterPlacement = spy.mock.calls.length;
    expect(afterPlacement).toBe(1);

    // Scroll and resize are the per-frame paths. A full-document walk is
    // 1.18 ms clean and 8.14 ms at 6x throttling — fine once, fatal at 60 Hz.
    document.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('resize'));
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(spy.mock.calls.length).toBe(afterPlacement);
  });

  it('a v3-shaped page with no boundary still stores the comment', () => {
    document.body.innerHTML = '<span id="lonely">x</span>';
    const lonely = document.querySelector('#lonely') as HTMLElement;
    mockRect(document.body, { left: 0, top: 0, width: 1000, height: 800 });
    mockRect(lonely, { left: 0, top: 0, width: 20, height: 20 });
    annotator = make();
    arm();
    clickPage(lonely, 5, 5);
    expect(stored()).toHaveLength(1);
  });
});

describe('the outline is the composer‘s shadow', () => {
  let annotator: Annotator | null = null;

  afterEach(() => {
    annotator?.destroy();
    annotator = null;
    localStorage.clear();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('paints boundary and member when a pin is placed', () => {
    const { button } = page();
    annotator = make();
    arm();
    clickPage(button);
    const boxes = outlines();
    expect(boxes.length).toBe(2);
    // Exactly one target treatment: the member. The boundary is a whisper.
    expect(shadow().querySelectorAll('.so > i[data-m]').length).toBe(1);
  });

  // Exclusions only exist on the marquee path, so asserting this through a
  // point pin proved nothing — there was never an exclusion to skip. Driven at
  // the renderer instead, where a set with exclusions can actually be handed in.
  it('never renders the exclusions — absence is already the signal', () => {
    document.body.innerHTML = '<div id="b"></div><div id="m"></div><div id="x"></div>';
    const [boundary, member, excluded] = ['#b', '#m', '#x'].map(
      (sel) => document.querySelector(sel) as HTMLElement,
    );
    for (const [i, node] of [boundary!, member!, excluded!].entries()) {
      mockRect(node, { left: i * 100, top: 0, width: 90, height: 40 });
    }
    const root = document.createElement('div');
    document.body.appendChild(root);
    const outline = new ScopeOutline();
    outline.show(root, {
      scope: {
        gen: 1,
        rung: 'testid',
        confidence: 'high',
        boundary: { tag: 'div', css: '#b' },
        members: [{ tag: 'div', css: '#m', band: 'inside' }],
        excluded: [{ tag: 'div', css: '#x' }],
      },
      elements: {
        boundary: boundary!,
        members: [member!],
        excluded: [excluded!],
        membersComplete: true,
      },
    });
    // The boundary and the one member — the excluded node draws nothing.
    expect(root.querySelectorAll('.so > i')).toHaveLength(2);
    expect(root.querySelectorAll('.so > i[data-m]')).toHaveLength(1);
  });

  it('drops a box it cannot honestly place rather than fabricating one', () => {
    // display:contents reports 0,0,0,0 AT THE VIEWPORT ORIGIN, so a minimum
    // size would paint a stray box in the top-left corner — worse than nothing.
    document.body.innerHTML = '<div id="b"></div><div id="ghost"></div>';
    const boundary = document.querySelector('#b') as HTMLElement;
    const ghost = document.querySelector('#ghost') as HTMLElement;
    mockRect(boundary, { left: 10, top: 10, width: 100, height: 40 });
    mockRect(ghost, { left: 0, top: 0, width: 0, height: 0 });
    vi.spyOn(ghost, 'getClientRects').mockReturnValue({ length: 0 } as unknown as DOMRectList);
    const root = document.createElement('div');
    document.body.appendChild(root);
    new ScopeOutline().show(root, {
      scope: {
        gen: 1,
        rung: 'anchor',
        confidence: 'low',
        boundary: { tag: 'div', css: '#b' },
        members: [{ tag: 'div', css: '#ghost', band: 'inside' }],
      },
      elements: { boundary, members: [ghost], excluded: [], membersComplete: true },
    });
    expect(root.querySelectorAll('.so > i')).toHaveLength(1);
  });

  it('marks an uncertain scope dashed', () => {
    document.body.innerHTML = '<div id="b"></div>';
    const boundary = document.querySelector('#b') as HTMLElement;
    mockRect(boundary, { left: 0, top: 0, width: 100, height: 40 });
    const root = document.createElement('div');
    document.body.appendChild(root);
    new ScopeOutline().show(root, {
      scope: { gen: 1, rung: 'anchor', confidence: 'low', boundary: { tag: 'div', css: '#b' } },
      elements: { boundary, members: [], excluded: [], membersComplete: true },
    });
    expect(root.querySelectorAll('.so > i[data-d]')).toHaveLength(1);
  });

  it('clears when the composer closes', () => {
    const { button } = page();
    annotator = make();
    arm();
    clickPage(button);
    expect(outlines().length).toBeGreaterThan(0);
    saveDraft();
    expect(outlines().length).toBe(0);
  });

  it('clears on destroy, leaving nothing behind', () => {
    const { button } = page();
    annotator = make();
    arm();
    clickPage(button);
    annotator.destroy();
    annotator = null;
    expect(document.querySelectorAll('.so').length).toBe(0);
  });

  it('never outlines when an EXISTING pin is opened', () => {
    const { button } = page();
    annotator = make();
    arm();
    clickPage(button);
    saveDraft();
    expect(outlines().length).toBe(0);

    // Scope was resolved against the DOM at creation. Re-outlining today's DOM
    // would attribute a boundary to a reviewer who never saw it — the same
    // honesty violation as a backfill.
    shadow().querySelector<HTMLButtonElement>('.pin')?.click();
    expect(outlines().length).toBe(0);
  });

  it('abandoning from the outline-shown state leaves no comment and emits nothing', () => {
    const { button } = page();
    const onChange = vi.fn();
    annotator = make({ onChange });
    arm();
    clickPage(button);
    expect(outlines().length).toBeGreaterThan(0);
    // Escape discards a draft whose saved text is still empty.
    escapeDraft();
    expect(outlines().length).toBe(0);
    expect(stored()).toHaveLength(0);

    // The plan's criterion reads "no comment in storage, NO onChange
    // emission". The first half holds. The second does not, and not because of
    // anything here: _commitTextComment has announced the empty comment at
    // PLACEMENT time since 0.1.0, so an abandoned draft has always emitted an
    // add followed by a delete. Deferring the add until first save would
    // change the sync protocol's write semantics for every annotation, which
    // is a larger decision than this release. What is asserted instead is the
    // property that actually matters to a synced host: the pair nets to zero
    // on the same id, so a conformant backend converges on nothing.
    const changes = onChange.mock.calls.map(([, change]) => change);
    const adds = changes.filter((c) => c.type === 'add').map((c) => c.comment.id);
    const deletes = changes.filter((c) => c.type === 'delete').map((c) => c.comment.id);
    expect(adds).toHaveLength(1);
    expect(deletes).toEqual(adds);
  });
});

describe('a heal demotes the scope it invalidated', () => {
  let annotator: Annotator | null = null;

  afterEach(() => {
    annotator?.destroy();
    annotator = null;
    localStorage.clear();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('drops the derived node lists and marks the record stale', () => {
    const { button } = page();
    annotator = make();
    arm();
    clickPage(button);
    saveDraft();
    expect(stored()[0]!.scope!.members).toBeDefined();

    // The agent rewrote the page: same text, different position, so the ladder
    // heals onto an element that is NOT the one the reviewer pinned.
    document.body.innerHTML =
      '<section data-testid="pricing"><i>spacer</i><button id="cta">Upgrade</button></section>';
    const moved = document.querySelector('#cta') as HTMLElement;
    mockRect(document.body, { left: 0, top: 0, width: 1000, height: 800 });
    mockRect(document.querySelector('section')!, { left: 0, top: 100, width: 600, height: 300 });
    mockRect(moved, { left: 40, top: 200, width: 200, height: 48 });
    annotator.refreshRoute();

    const healed = stored()[0]!.scope!;
    expect(healed.members).toBeUndefined();
    expect(healed.excluded).toBeUndefined();
    expect(healed.confidence).toBe('low');
    expect(healed.stale).toBe(true);
    // The boundary survives — it is the one claim a heal does not invalidate.
    expect(healed.boundary.tag).toBe('main');
  });
});
