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

  it('reposition performs zero re-resolutions for anchored and orphaned pins (P2.2)', () => {
    seed([bodyAnchored('c1'), orphaned('c2')]);
    annotator = makeAnnotator('reviewer');
    const baseline = resolveCalls();

    reposition(annotator, 5);

    expect(resolveCalls()).toBe(baseline);
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
