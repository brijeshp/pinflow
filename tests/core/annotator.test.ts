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

describe('Annotator explicit-save lifecycle', () => {
  let annotator: Annotator | null = null;

  afterEach(() => {
    annotator?.destroy();
    annotator = null;
    localStorage.clear();
    document.body.innerHTML = '';
  });

  function clickSave(): void {
    const save = shadow().querySelector<HTMLButtonElement>('button.save');
    if (!save) throw new Error('no save button');
    save.click();
  }

  it('Save persists the text, closes the popup, and Delete stays destructive-only', () => {
    seedStore(makeComment('original'));
    annotator = makeAnnotator();

    const ta = openFirstPinInput();
    ta.value = 'explicitly saved';
    clickSave();

    expect(shadow().querySelector('.input')).toBeNull(); // popup closed
    expect(loadStore(localStorage, PROJECT, REVIEWER)?.comments[0]?.text).toBe('explicitly saved');

    openFirstPinInput();
    shadow().querySelector<HTMLButtonElement>('button.delete')?.click();
    expect(loadStore(localStorage, PROJECT, REVIEWER)?.comments ?? []).toHaveLength(0);
  });

  it('Escape dismisses without saving; typing is never auto-persisted', () => {
    seedStore(makeComment('original'));
    annotator = makeAnnotator();

    const ta = openFirstPinInput();
    ta.value = 'typed but abandoned';
    ta.dispatchEvent(new Event('input'));
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(shadow().querySelector('.input')).toBeNull();
    expect(loadStore(localStorage, PROJECT, REVIEWER)?.comments[0]?.text).toBe('original');
  });

  it('clicking outside the popup dismisses without saving', async () => {
    seedStore(makeComment('original'));
    annotator = makeAnnotator();

    const ta = openFirstPinInput();
    ta.value = 'typed then clicked away';
    await flushMicrotasks(); // arm the outside-dismiss listener (next task)
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));

    expect(shadow().querySelector('.input')).toBeNull();
    expect(loadStore(localStorage, PROJECT, REVIEWER)?.comments[0]?.text).toBe('original');
  });

  it('dismissing a never-saved empty comment deletes it (no orphan pins)', () => {
    seedStore(makeComment(''));
    annotator = makeAnnotator();

    const ta = openFirstPinInput();
    ta.value = 'typed but never saved';
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(loadStore(localStorage, PROJECT, REVIEWER)?.comments ?? []).toHaveLength(0);
    expect(shadow().querySelector('.pin')).toBeNull();
  });

  it('Cmd+Enter saves like the Save button', () => {
    seedStore(makeComment('original'));
    annotator = makeAnnotator();

    const ta = openFirstPinInput();
    ta.value = 'keyboard saved';
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true }));

    expect(shadow().querySelector('.input')).toBeNull();
    expect(loadStore(localStorage, PROJECT, REVIEWER)?.comments[0]?.text).toBe('keyboard saved');
  });

  it('unsaved typing is discarded on destroy() — no write after teardown', () => {
    seedStore(makeComment('original'));
    annotator = makeAnnotator();

    const ta = openFirstPinInput();
    ta.value = 'typed then torn down';
    const rawBefore = localStorage.getItem(storageKey(PROJECT, REVIEWER));
    annotator.destroy();
    annotator = null;

    expect(localStorage.getItem(storageKey(PROJECT, REVIEWER))).toBe(rawBefore);
    expect(loadStore(localStorage, PROJECT, REVIEWER)?.comments[0]?.text).toBe('original');
  });

  it('route change discards unsaved typing (Save is the only commit)', () => {
    seedStore(makeComment('original'));
    annotator = makeAnnotator();

    const ta = openFirstPinInput();
    ta.value = 'edited before navigation';
    annotator.refreshRoute();

    expect(loadStore(localStorage, PROJECT, REVIEWER)?.comments[0]?.text).toBe('original');
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
    annotator = makeAnnotator();
    const ta = openFirstPinInput();
    ta.value = newText;
    const save = shadow().querySelector<HTMLButtonElement>('button.save');
    if (!save) throw new Error('no save button');
    save.click();
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

describe('Annotator body-cursor save/restore (P4.6)', () => {
  let annotator: Annotator | null = null;

  afterEach(() => {
    annotator?.destroy();
    annotator = null;
    document.body.style.cursor = '';
    localStorage.clear();
    document.body.innerHTML = '';
  });

  function enterAnnotateMode(): void {
    shadow().querySelector<HTMLButtonElement>('.control')?.click();
    const add = Array.from(shadow().querySelectorAll('button')).find(
      (b) => b.textContent === 'Add comment',
    );
    if (!add) throw new Error('Add comment button not found');
    add.click();
  }

  it('restores the host page cursor it found, not a hardcoded empty string', () => {
    document.body.style.cursor = 'pointer';
    annotator = makeAnnotator();
    enterAnnotateMode();
    expect(document.body.style.cursor).toBe('crosshair');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.body.style.cursor).toBe('pointer');
  });
});

describe('Annotator deferred identity (P4.3)', () => {
  let annotator: Annotator | null = null;

  afterEach(() => {
    annotator?.destroy();
    annotator = null;
    localStorage.clear();
    document.body.innerHTML = '';
  });

  function place(a: Annotator): void {
    (a as unknown as { _placeCommentAt(x: number, y: number, t: Element): void })._placeCommentAt(
      10,
      10,
      document.body,
    );
  }

  function makeDeferred(resolveIdentity: () => string | null): Annotator {
    return new Annotator({
      config: { project: PROJECT, activation: { mode: 'stealth' } },
      reviewer: null,
      mode: 'reviewer',
      storage: localStorage,
      resolveIdentity,
    });
  }

  it('resolves identity once at first placement and loads that reviewer corpus', () => {
    const resolveIdentity = vi.fn().mockReturnValue('Ghost');
    annotator = makeDeferred(resolveIdentity);
    expect(resolveIdentity).not.toHaveBeenCalled();

    // Save text after each placement: switching away from an unsaved EMPTY
    // popup discards that comment by design (explicit-save semantics).
    const saveWith = (text: string): void => {
      const ta = shadow().querySelector('textarea');
      if (!ta) throw new Error('input did not open');
      ta.value = text;
      shadow().querySelector<HTMLButtonElement>('button.save')?.click();
    };
    place(annotator);
    saveWith('first');
    place(annotator);
    saveWith('second');
    expect(resolveIdentity).toHaveBeenCalledTimes(1);
    const store = loadStore(localStorage, PROJECT, 'Ghost');
    expect(store?.comments).toHaveLength(2);
  });

  it('declined identity aborts placement without writing anything', () => {
    const resolveIdentity = vi.fn().mockReturnValue(null);
    annotator = makeDeferred(resolveIdentity);
    place(annotator);
    expect(resolveIdentity).toHaveBeenCalledTimes(1);
    expect(localStorage.length).toBe(0);
    // Not sticky: the next activation asks again.
    place(annotator);
    expect(resolveIdentity).toHaveBeenCalledTimes(2);
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
