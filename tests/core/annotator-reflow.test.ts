import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveAnchor } from '../../src/core/anchor';
import { emptyStore, saveStore } from '../../src/core/storage';
import { routeKey } from '../../src/core/route-key';
import type { Comment, Mode } from '../../src/core/types';
import { Annotator } from '../../src/core/ui/annotator';

// Wrap resolveAnchor with a call-through spy so the reflow tests can assert
// how many full selector-ladder resolutions each path performs.
vi.mock('../../src/core/anchor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/anchor')>();
  return { ...actual, resolveAnchor: vi.fn(actual.resolveAnchor) };
});

const PROJECT = 'p';
const REVIEWER = 'Tester';

interface Repositionable {
  _repositionPins(): void;
}

function makeComment(id: string, selectors: Comment['anchor']['selectors']): Comment {
  return {
    id,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    route: routeKey(),
    fullUrl: window.location.href,
    text: 'note',
    modality: 'text',
    anchor: {
      selectors,
      textFingerprint: '',
      positionPercent: { x: 50, y: 50 },
      viewport: { width: 800, height: 600 },
    },
  };
}

function bodyAnchored(id: string): Comment {
  return makeComment(id, { testid: null, id: null, css: 'body', xpath: '/html/body' });
}

function orphaned(id: string): Comment {
  return makeComment(id, {
    testid: null,
    id: null,
    css: '#definitely-not-present',
    xpath: '/html/body/div[99]',
  });
}

function testidAnchored(id: string, testid: string): Comment {
  return makeComment(id, { testid, id: null, css: '#nope', xpath: '/html/body/div[99]' });
}

function seed(comments: Comment[]): void {
  saveStore(localStorage, { ...emptyStore(PROJECT, REVIEWER), comments });
}

function makeAnnotator(mode: Mode, storage: Storage = localStorage): Annotator {
  return new Annotator({ config: { project: PROJECT }, reviewer: REVIEWER, mode, storage });
}

function reposition(annotator: Annotator, times = 1): void {
  const a = annotator as unknown as Repositionable;
  for (let i = 0; i < times; i++) a._repositionPins();
}

const resolveCalls = (): number => vi.mocked(resolveAnchor).mock.calls.length;

describe('Annotator reflow caching', () => {
  let annotator: Annotator | null = null;

  afterEach(() => {
    annotator?.destroy();
    annotator = null;
    localStorage.clear();
    document.body.innerHTML = '';
    vi.mocked(resolveAnchor).mockClear();
  });

  it('builder-mode reposition does not re-read localStorage per frame (P2.1)', () => {
    seed([bodyAnchored('c1')]);
    const getItem = vi.fn((k: string): string | null => localStorage.getItem(k));
    const storage: Storage = {
      get length() {
        return localStorage.length;
      },
      key: (i: number) => localStorage.key(i),
      getItem,
      setItem: (k: string, v: string) => localStorage.setItem(k, v),
      removeItem: (k: string) => localStorage.removeItem(k),
      clear: () => localStorage.clear(),
    };
    annotator = makeAnnotator('builder', storage);
    const baseline = getItem.mock.calls.length;

    reposition(annotator, 5);

    expect(getItem.mock.calls.length).toBe(baseline);
  });

  it('reposition performs zero re-resolutions inside the orphan-retry window (P2.2 + #22)', () => {
    seed([bodyAnchored('c1'), orphaned('c2')]);
    annotator = makeAnnotator('reviewer');
    // First reposition may spend ONE bounded orphan retry (codex #22); pin the
    // clock so every subsequent frame is inside the 500ms window and must be
    // pure cache hits — the P2.2 scroll-cost guarantee.
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(1_000);
    reposition(annotator, 1);
    const baseline = resolveCalls();

    reposition(annotator, 5);

    expect(resolveCalls()).toBe(baseline);
    nowSpy.mockRestore();
  });

  it('a disconnected cached element is re-resolved exactly once (P2.2)', () => {
    const target = document.createElement('div');
    target.dataset['testid'] = 'anchor-target';
    document.body.appendChild(target);
    seed([testidAnchored('c1', 'anchor-target')]);
    annotator = makeAnnotator('reviewer');

    // Host re-render: the cached element leaves the DOM and a replacement appears.
    target.remove();
    const replacement = document.createElement('div');
    replacement.dataset['testid'] = 'anchor-target';
    document.body.appendChild(replacement);

    const baseline = resolveCalls();
    reposition(annotator);
    expect(resolveCalls()).toBe(baseline + 1);

    // The re-resolved (connected) element is cached — no further resolutions.
    reposition(annotator, 3);
    expect(resolveCalls()).toBe(baseline + 1);
  });
});

describe('bounded orphan recovery (codex audit #22)', () => {
  afterEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('an anchor that mounts AFTER init heals on a later reflow (throttled), and orphan styling clears', () => {
    saveStore(localStorage, {
      ...emptyStore(PROJECT, REVIEWER),
      comments: [
        makeComment('late', { testid: 'late-el', id: null, css: '#nope', xpath: '/nope' }),
      ],
    });
    const annotator = new Annotator({
      config: { project: PROJECT },
      reviewer: REVIEWER,
      mode: 'reviewer' as Mode,
      storage: localStorage,
    });
    const shadowRoot = document.querySelector('[data-pinflow-root]')!.shadowRoot!;
    const pin = shadowRoot.querySelector<HTMLElement>('.pin')!;
    expect(pin.dataset['orphaned']).toBe('true');

    // The element arrives late (async host content).
    const el = document.createElement('div');
    el.setAttribute('data-testid', 'late-el');
    document.body.appendChild(el);

    const nowSpy = vi.spyOn(performance, 'now');
    nowSpy.mockReturnValue(10_000); // beyond the 500ms retry window
    (annotator as unknown as Repositionable)._repositionPins();
    expect(pin.dataset['orphaned']).toBeUndefined();

    // Within the window, a still-missing anchor is NOT re-laddered per frame.
    const calls = vi.mocked(resolveAnchor).mock.calls.length;
    nowSpy.mockReturnValue(10_100);
    (annotator as unknown as Repositionable)._repositionPins();
    expect(vi.mocked(resolveAnchor).mock.calls.length).toBe(calls); // cache hit only
    annotator.destroy();
  });
});

describe('orphan presentation + heal persistence (0.3.0 first-user feedback)', () => {
  afterEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  function mount(): Annotator {
    return new Annotator({
      config: { project: PROJECT },
      reviewer: REVIEWER,
      mode: 'reviewer' as Mode,
      storage: localStorage,
    });
  }
  function shadowRoot(): ShadowRoot {
    return document.querySelector('[data-pinflow-root]')!.shadowRoot!;
  }

  it('orphaned pins are HIDDEN, not gray floaters mid-page', () => {
    seed([orphaned('o1')]);
    const a = mount();
    const pin = shadowRoot().querySelector<HTMLElement>('.pin')!;
    expect(pin.dataset['orphaned']).toBe('true');
    expect(pin.style.display).toBe('none');
    a.destroy();
  });

  it('a heal un-hides the pin again', () => {
    seed([
      makeComment('late2', { testid: 'late-2', id: null, css: '#nope', xpath: '/nope' }),
    ]);
    const a = mount();
    const pin = shadowRoot().querySelector<HTMLElement>('.pin')!;
    expect(pin.style.display).toBe('none');
    const el = document.createElement('div');
    el.setAttribute('data-testid', 'late-2');
    document.body.appendChild(el);
    vi.spyOn(performance, 'now').mockReturnValue(10_000);
    (a as unknown as Repositionable)._repositionPins();
    expect(pin.style.display).not.toBe('none');
    a.destroy();
  });

  it('a heal through the fallback chain persists rebuilt selectors — next load matches exactly', () => {
    // Broken css/xpath, real fingerprint: resolution succeeds via the
    // fingerprint walk, and the stale selectors must be repaired in storage.
    const target = document.createElement('p');
    target.textContent = 'A stable paragraph the reviewer pinned.';
    document.body.appendChild(target);
    const c = makeComment('heal1', {
      testid: null,
      id: null,
      css: '#long-gone',
      xpath: '/html/body/div[42]',
    });
    c.anchor.textFingerprint = 'A stable paragraph the reviewer pinned.';
    seed([c]);
    const a = mount();
    const stored = JSON.parse(localStorage.getItem(`pinflow:c:${PROJECT}:${REVIEWER}`)!);
    expect(stored.comments[0].anchor.selectors.css).not.toBe('#long-gone');
    expect(stored.comments[0].anchor.textFingerprint).toBe(
      'A stable paragraph the reviewer pinned.',
    ); // provenance stays
    expect(stored.comments[0].updatedAt).toBe(c.updatedAt); // silent repair
    a.destroy();
  });
});
