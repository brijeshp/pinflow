import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyStore, loadStore, saveStore, storageKey } from '../../src/core/storage';
import { routeKey } from '../../src/core/route-key';
import type { Comment } from '../../src/core/types';
import type { VoiceHost, VoiceModule, VoiceSession } from '../../src/core/voice-contract';
import { Annotator } from '../../src/core/ui/annotator';

const PROJECT = 'p';
const REVIEWER = 'Tester';

function shadow(): ShadowRoot {
  const host = document.querySelector('[data-pinflow-root]');
  if (!host?.shadowRoot) throw new Error('pinflow root not mounted');
  return host.shadowRoot;
}

function makeComment(text: string): Comment {
  return {
    id: 'c1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    route: routeKey(),
    fullUrl: window.location.href,
    text,
    modality: 'text',
    anchor: {
      selectors: { testid: null, id: null, css: 'body', xpath: '/html/body' },
      textFingerprint: '',
      positionPercent: { x: 50, y: 50 },
      viewport: { width: 800, height: 600 },
    },
  };
}

function seedStore(comment: Comment): void {
  saveStore(localStorage, { ...emptyStore(PROJECT, REVIEWER), comments: [comment] });
}

function makeAnnotator(extra?: {
  voice?: true;
  loadVoice?: () => Promise<VoiceModule>;
}): Annotator {
  return new Annotator({
    config: { project: PROJECT, ...(extra?.voice ? { voice: {} } : {}) },
    reviewer: REVIEWER,
    mode: 'reviewer',
    storage: localStorage,
    ...(extra?.loadVoice ? { loadVoice: extra.loadVoice } : {}),
  });
}

function openFirstPinInput(): HTMLTextAreaElement {
  const pin = shadow().querySelector<HTMLDivElement>('.pin');
  if (!pin) throw new Error('no pin rendered');
  pin.click();
  const ta = shadow().querySelector('textarea');
  if (!ta) throw new Error('input did not open');
  return ta;
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('Annotator debounced save lifecycle (P0.5)', () => {
  let annotator: Annotator | null = null;

  afterEach(() => {
    annotator?.destroy();
    annotator = null;
    vi.useRealTimers();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('delete within the debounce window does not resurrect the comment', () => {
    vi.useFakeTimers();
    seedStore(makeComment('original'));
    annotator = makeAnnotator();

    const ta = openFirstPinInput();
    ta.value = 'typed just before delete';
    ta.dispatchEvent(new Event('input'));

    const del = shadow().querySelector<HTMLButtonElement>('button.delete');
    if (!del) throw new Error('no delete button');
    del.click();

    vi.advanceTimersByTime(3000);
    const store = loadStore(localStorage, PROJECT, REVIEWER);
    expect(store?.comments ?? []).toHaveLength(0);
  });

  it('does not write to storage after destroy()', () => {
    vi.useFakeTimers();
    seedStore(makeComment('original'));
    annotator = makeAnnotator();

    const ta = openFirstPinInput();
    ta.value = 'typed then torn down';
    ta.dispatchEvent(new Event('input'));

    annotator.destroy();
    annotator = null;
    const rawAfterDestroy = localStorage.getItem(storageKey(PROJECT, REVIEWER));

    vi.advanceTimersByTime(3000);
    expect(localStorage.getItem(storageKey(PROJECT, REVIEWER))).toBe(rawAfterDestroy);
    const store = loadStore(localStorage, PROJECT, REVIEWER);
    expect(store?.comments[0]?.text).toBe('original');
  });

  it('closing the input (route change) flushes pending typing immediately', () => {
    vi.useFakeTimers();
    seedStore(makeComment('original'));
    annotator = makeAnnotator();

    const ta = openFirstPinInput();
    ta.value = 'edited before navigation';
    ta.dispatchEvent(new Event('input'));

    // Route change closes the input; the pending debounce must flush, not drop.
    annotator.refreshRoute();

    const store = loadStore(localStorage, PROJECT, REVIEWER);
    expect(store?.comments[0]?.text).toBe('edited before navigation');
  });
});

describe('Annotator voice edited flag (P3.3)', () => {
  let annotator: Annotator | null = null;

  afterEach(() => {
    annotator?.destroy();
    annotator = null;
    vi.useRealTimers();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  function makeVoiceComment(text: string): Comment {
    return {
      ...makeComment(text),
      modality: 'voice',
      voice: { durationMs: 1200, engine: 'deepgram:nova-3' },
    };
  }

  function editFirstPin(newText: string): void {
    vi.useFakeTimers();
    annotator = makeAnnotator();
    const ta = openFirstPinInput();
    ta.value = newText;
    ta.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(2500); // fire the debounced save
  }

  it('marks voice meta edited:true when the transcript text is changed', () => {
    seedStore(makeVoiceComment('original transcript'));
    editFirstPin('hand-corrected transcript');
    const store = loadStore(localStorage, PROJECT, REVIEWER);
    expect(store?.comments[0]?.voice).toMatchObject({
      edited: true,
      durationMs: 1200,
      engine: 'deepgram:nova-3',
    });
  });

  it('does not mark edited when the text is saved unchanged', () => {
    seedStore(makeVoiceComment('original transcript'));
    editFirstPin('original transcript');
    const store = loadStore(localStorage, PROJECT, REVIEWER);
    expect(store?.comments[0]?.voice?.edited).toBeUndefined();
  });

  it('editing a text comment never grows voice meta', () => {
    seedStore(makeComment('plain text'));
    editFirstPin('edited text');
    const store = loadStore(localStorage, PROJECT, REVIEWER);
    expect(store?.comments[0]?.text).toBe('edited text');
    expect(store?.comments[0]?.voice).toBeUndefined();
  });
});

describe('Annotator voice host generation guards (P0.6)', () => {
  let annotator: Annotator | null = null;

  afterEach(() => {
    annotator?.destroy();
    annotator = null;
    window.history.pushState({}, '', '/');
    localStorage.clear();
    document.body.innerHTML = '';
  });

  async function startVoiceAndCaptureHost(): Promise<VoiceHost> {
    let captured: VoiceHost | null = null;
    const session: VoiceSession = { stop: () => Promise.resolve(), dispose: () => {} };
    const loadVoice = (): Promise<VoiceModule> =>
      Promise.resolve({
        start: (h: VoiceHost) => {
          captured = h;
          return Promise.resolve(session);
        },
      });
    annotator = makeAnnotator({ voice: true, loadVoice });
    (
      annotator as unknown as { _placeCommentAt(x: number, y: number, t: Element): void }
    )._placeCommentAt(10, 10, document.body);
    await flushMicrotasks();
    if (!captured) throw new Error('voice host was never built');
    return captured;
  }

  it('degradeToText after destroy() is a no-op: no storage write, no DOM', async () => {
    const host = await startVoiceAndCaptureHost();
    annotator?.destroy();
    annotator = null;

    host.degradeToText('late failure text');

    expect(localStorage.getItem(storageKey(PROJECT, REVIEWER))).toBeNull();
    expect(document.querySelector('[data-pinflow-root]')).toBeNull();
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('degradeToText after a route change commits to the FROZEN route', async () => {
    const frozenRoute = routeKey();
    const host = await startVoiceAndCaptureHost();

    window.history.pushState({}, '', '/other-page');
    annotator?.refreshRoute();
    await flushMicrotasks();

    host.degradeToText('salvaged transcript');

    const store = loadStore(localStorage, PROJECT, REVIEWER);
    expect(store?.comments).toHaveLength(1);
    expect(store?.comments[0]?.text).toBe('salvaged transcript');
    expect(store?.comments[0]?.route).toBe(frozenRoute);
    // No editor may open — the recording's route is no longer on screen.
    expect(shadow().querySelector('.input')).toBeNull();
  });
});
