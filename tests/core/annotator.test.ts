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
  mode?: 'reviewer' | 'builder';
}): Annotator {
  return new Annotator({
    config: { project: PROJECT, ...(extra?.voice ? { voice: {} } : {}) },
    reviewer: REVIEWER,
    mode: extra?.mode ?? 'reviewer',
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

// jsdom has no PointerEvent; a plain Event with pointer fields assigned is what
// the annotator's document-level listeners actually receive in tests.
function pointer(type: string, props: Record<string, unknown> = {}): Event {
  const e = new Event(type, { bubbles: true, composed: true });
  Object.assign(e, props);
  return e;
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

  // The placeholder is the only prompt a reviewer gets. It asks for the change
  // they want, not for open-ended musing — the export lands in a coding agent.
  it('the comment textarea prompts for an actionable change', () => {
    seedStore(makeComment('original'));
    annotator = makeAnnotator();

    expect(openFirstPinInput().placeholder).toBe('What should change?');
  });

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

  it('a completed outside tap (down then up) dismisses without saving', async () => {
    seedStore(makeComment('original'));
    annotator = makeAnnotator();

    const ta = openFirstPinInput();
    ta.value = 'typed then clicked away';
    await flushMicrotasks(); // arm the outside-dismiss listener (next task)
    document.body.dispatchEvent(pointer('pointerdown'));
    document.body.dispatchEvent(pointer('pointerup'));

    expect(shadow().querySelector('.input')).toBeNull();
    expect(loadStore(localStorage, PROJECT, REVIEWER)?.comments[0]?.text).toBe('original');
  });

  it('an outside pointerdown alone does not dismiss — touch scroll keeps the draft', async () => {
    seedStore(makeComment('original'));
    annotator = makeAnnotator();

    openFirstPinInput();
    await flushMicrotasks();
    // Touch scroll/pan: down, then the browser takes the gesture (pointercancel).
    document.body.dispatchEvent(pointer('pointerdown', { pointerId: 7 }));
    expect(shadow().querySelector('.input')).not.toBeNull();
    document.body.dispatchEvent(pointer('pointercancel', { pointerId: 7 }));
    // A pointerup that never had a live down must not dismiss either.
    document.body.dispatchEvent(pointer('pointerup', { pointerId: 7 }));

    expect(shadow().querySelector('.input')).not.toBeNull();
  });

  it('a pinch (second finger joins) never dismisses the draft', async () => {
    seedStore(makeComment('original'));
    annotator = makeAnnotator();

    openFirstPinInput();
    await flushMicrotasks();
    // iOS pinch-out to recover from auto-zoom: first finger lands outside the
    // popup (primary), second finger joins (non-primary), then fingers lift.
    document.body.dispatchEvent(pointer('pointerdown', { pointerId: 1, isPrimary: true }));
    document.body.dispatchEvent(pointer('pointerdown', { pointerId: 2, isPrimary: false }));
    document.body.dispatchEvent(pointer('pointerup', { pointerId: 1, isPrimary: true }));
    document.body.dispatchEvent(pointer('pointerup', { pointerId: 2, isPrimary: false }));

    expect(shadow().querySelector('.input')).not.toBeNull();
  });

  it('a cross-boundary pinch (second finger inside the popup) never dismisses', async () => {
    seedStore(makeComment('original'));
    annotator = makeAnnotator();

    const ta = openFirstPinInput();
    await flushMicrotasks();
    // First finger outside (primary), second finger lands ON the popup —
    // still a pinch: lifting the first finger must not eat the draft.
    document.body.dispatchEvent(pointer('pointerdown', { pointerId: 1, isPrimary: true }));
    ta.dispatchEvent(pointer('pointerdown', { pointerId: 2, isPrimary: false }));
    document.body.dispatchEvent(pointer('pointerup', { pointerId: 1, isPrimary: true }));
    ta.dispatchEvent(pointer('pointerup', { pointerId: 2, isPrimary: false }));

    expect(shadow().querySelector('.input')).not.toBeNull();
  });

  it('dragging from outside and releasing inside the popup keeps it open', async () => {
    seedStore(makeComment('original'));
    annotator = makeAnnotator();

    const ta = openFirstPinInput();
    await flushMicrotasks();
    document.body.dispatchEvent(pointer('pointerdown', { pointerId: 3 }));
    ta.dispatchEvent(pointer('pointerup', { pointerId: 3 }));

    expect(shadow().querySelector('.input')).not.toBeNull();
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

  // Two-step contract (first-user feedback): the control button ARMS
  // annotate mode by itself — no separate "Add comment" press.
  function enterAnnotateMode(): void {
    shadow().querySelector<HTMLButtonElement>('.control')?.click();
  }

  it('restores the host page cursor it found, not a hardcoded empty string', () => {
    document.body.style.cursor = 'pointer';
    annotator = makeAnnotator();
    enterAnnotateMode();
    expect(document.body.style.cursor).toBe('crosshair');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.body.style.cursor).toBe('pointer');
  });

  it('control click arms annotate immediately: button then page = pin (3 steps → 2)', () => {
    annotator = makeAnnotator();
    enterAnnotateMode();
    expect(document.body.style.cursor).toBe('crosshair');
    const target = document.createElement('p');
    target.textContent = 'host paragraph';
    document.body.appendChild(target);
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(shadow().querySelector('textarea')).not.toBeNull();
  });

  it('the opened panel offers Stop (not Add comment) while armed', () => {
    annotator = makeAnnotator();
    enterAnnotateMode();
    const labels = Array.from(shadow().querySelectorAll('button')).map((b) => b.textContent);
    expect(labels).toContain('Stop');
    expect(labels).not.toContain('Add comment');
  });

  it('second control click disarms and closes the panel', () => {
    annotator = makeAnnotator();
    enterAnnotateMode();
    shadow().querySelector<HTMLButtonElement>('.control')?.click();
    expect(document.body.style.cursor).toBe('');
    const target = document.createElement('p');
    document.body.appendChild(target);
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(shadow().querySelector('textarea')).toBeNull();
  });

  it('placing a pin closes the menu — focus moves to the draft popup', () => {
    annotator = makeAnnotator();
    enterAnnotateMode();
    const target = document.createElement('p');
    document.body.appendChild(target);
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(shadow().querySelector('textarea')).not.toBeNull();
    expect(shadow().querySelector('.panel h3')).toBeNull();
  });

  it('builder mode control click keeps its drawer-only behavior (no crosshair)', () => {
    annotator = makeAnnotator({ mode: 'builder' });
    shadow().querySelector<HTMLButtonElement>('.control')?.click();
    expect(document.body.style.cursor).toBe('');
  });

  // Armed + click an EXISTING pin: the edit popup takes over, so the mode must
  // disarm — otherwise the still-attached capture listener lets one outside
  // click dismiss the popup AND place a spurious pin from the same event.
  it('clicking an existing pin while armed disarms; an outside click places no spurious pin', () => {
    seedStore(makeComment('existing'));
    annotator = makeAnnotator();
    enterAnnotateMode();
    expect(document.body.style.cursor).toBe('crosshair');

    const pin = shadow().querySelector<HTMLElement>('.pin');
    if (!pin) throw new Error('no pin rendered');
    pin.click();
    expect(shadow().querySelector('textarea')).not.toBeNull(); // edit popup opened
    expect(document.body.style.cursor).toBe(''); // ...and annotate mode disarmed

    const target = document.createElement('p');
    document.body.appendChild(target);
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(loadStore(localStorage, PROJECT, REVIEWER)?.comments ?? []).toHaveLength(1);
  });

  it('clicking an existing pin while armed closes the menu — focus moves to the edit popup', () => {
    seedStore(makeComment('existing'));
    annotator = makeAnnotator();
    enterAnnotateMode();
    expect(shadow().querySelector('.panel h3')).not.toBeNull(); // menu open while armed

    shadow().querySelector<HTMLElement>('.pin')?.click();
    expect(shadow().querySelector('textarea')).not.toBeNull();
    expect(shadow().querySelector('.panel h3')).toBeNull();
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

describe('Annotator export API (L1.5)', () => {
  let annotator: Annotator | null = null;

  afterEach(() => {
    annotator?.destroy();
    annotator = null;
    localStorage.clear();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  function seedOther(): void {
    saveStore(localStorage, {
      ...emptyStore(PROJECT, 'Other'),
      comments: [{ ...makeComment('theirs'), id: 'c2' }],
    });
  }

  function makeBuilder(): Annotator {
    return new Annotator({
      config: { project: PROJECT },
      reviewer: '__builder__',
      mode: 'builder',
      storage: localStorage,
    });
  }

  it('exportJSON returns only the current reviewer corpus in reviewer mode', () => {
    seedStore(makeComment('mine'));
    seedOther();
    annotator = makeAnnotator();
    const parsed = JSON.parse(annotator.exportJSON());
    expect(parsed.pinflowExport).toBe(3);
    expect(parsed.comments.map((c: { reviewer: string }) => c.reviewer)).toEqual([REVIEWER]);
  });

  it('exportJSON aggregates every reviewer in builder mode', () => {
    seedStore(makeComment('mine'));
    seedOther();
    annotator = makeBuilder();
    const parsed = JSON.parse(annotator.exportJSON());
    expect(parsed.comments).toHaveLength(2);
  });

  it('builder drawer has a JSON button that downloads application/json', () => {
    seedStore(makeComment('mine'));
    annotator = makeBuilder();
    let blobType = '';
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
      blobType = (b as Blob).type;
      return 'blob:mock';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    shadow().querySelector<HTMLButtonElement>('button.control')!.click();
    const jsonBtn = [...shadow().querySelectorAll('button')].find((b) => b.textContent === 'JSON');
    expect(jsonBtn).toBeTruthy();
    jsonBtn!.click();
    expect(blobType).toContain('json');
  });
});

describe('Annotator submission moment (L1.6)', () => {
  let annotator: Annotator | null = null;

  afterEach(() => {
    annotator?.destroy();
    annotator = null;
    localStorage.clear();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  function mockDownloadPlumbing(): void {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  }

  function mockClipboard(ok: boolean): void {
    Object.defineProperty(navigator, 'clipboard', {
      value: ok ? { writeText: vi.fn().mockResolvedValue(undefined) } : undefined,
      configurable: true,
    });
  }

  async function exportViaPanel(submitTo?: { email: string; subject?: string }): Promise<void> {
    seedStore(makeComment('hello'));
    annotator = new Annotator({
      config: { project: PROJECT, ...(submitTo ? { submitTo } : {}) },
      reviewer: REVIEWER,
      mode: 'reviewer',
      storage: localStorage,
    });
    shadow().querySelector<HTMLButtonElement>('button.control')!.click();
    const exportBtn = [...shadow().querySelectorAll('button')].find(
      (b) => b.textContent === 'Export & share',
    );
    exportBtn!.click();
    await flushMicrotasks();
  }

  function findEmailButton(): HTMLButtonElement | undefined {
    return [...shadow().querySelectorAll('button')].find(
      (b) => b.textContent === 'Email it to the builder',
    ) as HTMLButtonElement | undefined;
  }

  it('confirmation gains a primary mailto button when submitTo is set', async () => {
    mockDownloadPlumbing();
    mockClipboard(true);
    await exportViaPanel({ email: 'dev@x.io', subject: 'Prototype feedback' });
    const btn = findEmailButton();
    expect(btn).toBeTruthy();
    expect(btn!.className).toContain('primary');
    expect(shadow().querySelector('.panel p')?.textContent).toBe(
      'Your feedback is copied — paste it into the email.',
    );
    btn!.click();
    expect(window.location.href).toBe('mailto:dev@x.io?subject=Prototype%20feedback');
  });

  it('subject defaults to "Feedback: <project>"; without a clipboard the hand-off points at the file', async () => {
    mockDownloadPlumbing();
    mockClipboard(false);
    await exportViaPanel({ email: 'dev@x.io' });
    // Previously this said "Share however you like", so the primary action
    // opened an empty email with nothing to paste and nothing to attach.
    expect(shadow().querySelector('.panel p')?.textContent).toBe(
      'Attach the downloaded file to the email.',
    );
    findEmailButton()!.click();
    expect(window.location.href).toBe(
      `mailto:dev@x.io?subject=${encodeURIComponent('Feedback: p')}`,
    );
  });

  it('no email button without submitTo', async () => {
    mockDownloadPlumbing();
    mockClipboard(true);
    await exportViaPanel();
    expect(findEmailButton()).toBeUndefined();
  });

  it('exportMarkdown returns the reviewer artifact; downloadExport skips the confirmation', () => {
    seedStore(makeComment('hello'));
    annotator = makeAnnotator();
    expect(annotator.exportMarkdown()).toContain(`# Feedback for ${PROJECT} — from ${REVIEWER}`);

    mockDownloadPlumbing();
    mockClipboard(true);
    const create = vi.mocked(URL.createObjectURL);
    annotator.downloadExport();
    expect(create).toHaveBeenCalledTimes(1);
    expect(shadow().querySelector('.panel')).toBeNull(); // no confirmation UI — host owns UX
  });

  it('exportMarkdown aggregates in builder mode', () => {
    seedStore(makeComment('hello'));
    annotator = new Annotator({
      config: { project: PROJECT },
      reviewer: '__builder__',
      mode: 'builder',
      storage: localStorage,
    });
    expect(annotator.exportMarkdown()).toContain('## Summary');
  });
});

describe('Annotator source hydration (L2.1)', () => {
  let annotator: Annotator | null = null;

  afterEach(() => {
    annotator?.destroy();
    annotator = null;
    localStorage.clear();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  function serverComment(overrides: Partial<Comment> = {}): Comment {
    return { ...makeComment(''), id: 'c_server', text: 'from the server', ...overrides };
  }

  function makeWithSource(
    source: () => Promise<Comment[]>,
    extra?: { onChange?: () => void; mode?: 'reviewer' | 'builder' },
  ): Annotator {
    return new Annotator({
      config: {
        project: PROJECT,
        source,
        ...(extra?.onChange ? { onChange: extra.onChange } : {}),
      },
      reviewer: extra?.mode === 'builder' ? '__builder__' : REVIEWER,
      mode: extra?.mode ?? 'reviewer',
      storage: localStorage,
    });
  }

  it('fetches once at init, merges by id, persists, and renders the pins', async () => {
    seedStore({ ...makeComment('local only'), id: 'c_local' });
    const source = vi.fn().mockResolvedValue([serverComment()]);
    annotator = makeWithSource(source);
    await flushMicrotasks();

    expect(source).toHaveBeenCalledTimes(1);
    const store = loadStore(localStorage, PROJECT, REVIEWER);
    expect(store?.comments.map((c) => c.id)).toEqual(['c_local', 'c_server']);
    expect(shadow().querySelectorAll('.pin')).toHaveLength(2);
  });

  it('server disposition lands on an existing local comment (status/resolution win)', async () => {
    seedStore(makeComment('my note')); // id c1
    const source = vi
      .fn()
      .mockResolvedValue([
        { ...makeComment('my note'), status: 'done' as const, resolution: 'Shipped.' },
      ]);
    annotator = makeWithSource(source);
    await flushMicrotasks();

    const c = loadStore(localStorage, PROJECT, REVIEWER)?.comments[0];
    expect(c).toMatchObject({ status: 'done', resolution: 'Shipped.' });
  });

  it('never emits onChange for hydration-APPLIED changes (shared and server-new ids)', async () => {
    seedStore(makeComment('mine')); // id c1
    const onChange = vi.fn();
    annotator = makeWithSource(
      vi
        .fn()
        .mockResolvedValue([
          { ...makeComment('server-updated c1'), updatedAt: '2027-01-01T00:00:00.000Z' },
          serverComment(),
        ]),
      { onChange },
    );
    await flushMicrotasks();

    // c1 was updated FROM the server, c_server added from the server — the
    // host's own data coming back must never echo into onChange.
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reconciles a stale server copy: local newer updatedAt re-announces as update (codex r16 P1)', async () => {
    seedStore({
      ...makeComment('locally saved newer text'),
      updatedAt: '2026-06-01T00:00:00.000Z',
    });
    const onChange = vi.fn();
    annotator = makeWithSource(
      vi.fn().mockResolvedValue([
        { ...makeComment(''), updatedAt: '2026-05-01T00:00:00.000Z' }, // same id c1, stale empty server text
      ]),
      { onChange },
    );
    await flushMicrotasks();

    expect(onChange).toHaveBeenCalledTimes(1);
    const [, change] = onChange.mock.calls[0]!;
    expect(change).toMatchObject({
      type: 'update',
      comment: { id: 'c1', text: 'locally saved newer text' },
    });
  });

  it('reconciles local-only comments: one add per comment the server list lacks (finding C)', async () => {
    seedStore(makeComment('mine')); // id c1 — never reached the server
    const onChange = vi.fn();
    annotator = makeWithSource(vi.fn().mockResolvedValue([serverComment()]), { onChange });
    await flushMicrotasks();

    expect(onChange).toHaveBeenCalledTimes(1);
    const [store, change] = onChange.mock.calls[0]!;
    expect(change).toMatchObject({ type: 'add', comment: { id: 'c1', text: 'mine' } });
    // Store snapshot handed to the host is post-merge (server comment present).
    expect(store.comments.map((c: Comment) => c.id).sort()).toEqual(['c1', 'c_server']);
  });

  it('a late resolution after destroy() writes nothing', async () => {
    seedStore(makeComment('mine'));
    let resolve!: (v: Comment[]) => void;
    annotator = makeWithSource(() => new Promise<Comment[]>((r) => (resolve = r)));
    const rawBefore = localStorage.getItem(storageKey(PROJECT, REVIEWER));

    annotator.destroy();
    annotator = null;
    resolve([serverComment()]);
    await flushMicrotasks();

    expect(localStorage.getItem(storageKey(PROJECT, REVIEWER))).toBe(rawBefore);
    expect(document.querySelector('[data-pinflow-root]')).toBeNull();
  });

  it('a late resolution SURVIVES refreshRoute() — SPA navigation must not drop the corpus (codex audit #3)', async () => {
    seedStore(makeComment('mine'));
    let resolve!: (v: Comment[]) => void;
    annotator = makeWithSource(() => new Promise<Comment[]>((r) => (resolve = r)));

    annotator.refreshRoute(); // navigation mid-fetch
    resolve([serverComment()]);
    await flushMicrotasks();

    const store = loadStore(localStorage, PROJECT, REVIEWER);
    expect(store?.comments.map((c) => c.id).sort()).toEqual(['c1', 'c_server'].sort());
  });

  it('a late resolution after destroy() is still dropped', async () => {
    seedStore(makeComment('mine'));
    let resolve!: (v: Comment[]) => void;
    annotator = makeWithSource(() => new Promise<Comment[]>((r) => (resolve = r)));

    annotator.destroy();
    resolve([serverComment()]);
    await flushMicrotasks();

    const store = loadStore(localStorage, PROJECT, REVIEWER);
    expect(store?.comments.map((c) => c.id)).toEqual(['c1']);
    annotator = null;
  });

  it('a rejected source warns and leaves localStorage authoritative', async () => {
    seedStore(makeComment('mine'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    annotator = makeWithSource(vi.fn().mockRejectedValue(new Error('offline')));
    await flushMicrotasks();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[pinflow]'), expect.any(Error));
    expect(loadStore(localStorage, PROJECT, REVIEWER)?.comments[0]?.text).toBe('mine');
    expect(shadow().querySelectorAll('.pin')).toHaveLength(1);
  });

  it('builder mode never calls source (per-reviewer scope; builder slice is later)', async () => {
    const source = vi.fn().mockResolvedValue([]);
    annotator = makeWithSource(source, { mode: 'builder' });
    await flushMicrotasks();
    expect(source).not.toHaveBeenCalled();
  });

  it('deferred (stealth) identity hydrates only after the identity resolves', async () => {
    const source = vi.fn().mockResolvedValue([serverComment()]);
    annotator = new Annotator({
      config: { project: PROJECT, source, activation: { mode: 'stealth' } },
      reviewer: null,
      mode: 'reviewer',
      storage: localStorage,
      resolveIdentity: () => 'Ghost',
    });
    await flushMicrotasks();
    expect(source).not.toHaveBeenCalled();

    (
      annotator as unknown as { _placeCommentAt(x: number, y: number, t: Element): void }
    )._placeCommentAt(10, 10, document.body);
    await flushMicrotasks();

    expect(source).toHaveBeenCalledTimes(1);
    const store = loadStore(localStorage, PROJECT, 'Ghost');
    expect(store?.comments.some((c) => c.id === 'c_server')).toBe(true);
  });
});

describe('Annotator resolution UI (L2.3)', () => {
  let annotator: Annotator | null = null;

  afterEach(() => {
    annotator?.destroy();
    annotator = null;
    localStorage.clear();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  function seedMany(comments: Comment[]): void {
    saveStore(localStorage, { ...emptyStore(PROJECT, REVIEWER), comments });
  }

  it('renders status treatments: done = muted ✓, declined = muted struck number, open = stock', () => {
    seedMany([
      { ...makeComment('shipped'), id: 'c_done', status: 'done', resolution: 'Shipped.' },
      { ...makeComment('rejected'), id: 'c_declined', status: 'declined' },
      { ...makeComment('still open'), id: 'c_open', status: 'open' },
      { ...makeComment('no status'), id: 'c_plain' },
    ]);
    annotator = makeAnnotator();

    const pins = [...shadow().querySelectorAll<HTMLDivElement>('.pin')];
    expect(pins).toHaveLength(4);
    const [done, declined, open, plain] = pins;
    expect(done?.dataset['status']).toBe('done');
    expect(done?.textContent).toBe('✓');
    expect(done?.title).toBe('Comment 1 — done');
    expect(declined?.dataset['status']).toBe('declined');
    expect(declined?.textContent).toBe('2'); // number stays, struck via CSS
    expect(open?.dataset['status']).toBeUndefined();
    expect(open?.textContent).toBe('3');
    expect(plain?.dataset['status']).toBeUndefined();
  });

  it('resolved popup is frozen: readOnly textarea, no Save/Delete, resolution line shown', () => {
    seedMany([{ ...makeComment('shipped'), status: 'done', resolution: 'Fixed in build 7.' }]);
    annotator = makeAnnotator();

    const ta = openFirstPinInput();
    expect(ta.readOnly).toBe(true);
    expect(ta.value).toBe('shipped'); // still selectable/copyable
    expect(shadow().querySelector('button.save')).toBeNull();
    expect(shadow().querySelector('button.delete')).toBeNull();
    expect(shadow().querySelector('.input .res')?.textContent).toBe('✓ Done — Fixed in build 7.');
  });

  it('declined without a resolution note omits the dash', () => {
    seedMany([{ ...makeComment('nope'), status: 'declined' }]);
    annotator = makeAnnotator();
    openFirstPinInput();
    expect(shadow().querySelector('.input .res')?.textContent).toBe('✕ Declined');
  });

  it('an open comment keeps the editable popup (no resolution line)', () => {
    seedMany([{ ...makeComment('editable'), status: 'open' }]);
    annotator = makeAnnotator();
    const ta = openFirstPinInput();
    expect(ta.readOnly).toBe(false);
    expect(shadow().querySelector('button.save')).not.toBeNull();
    expect(shadow().querySelector('.input .res')).toBeNull();
  });

  it('a hydrated disposition survives a reviewer edit attempt (Cmd+Enter is inert)', async () => {
    seedStore(makeComment('my note'));
    const source = vi
      .fn()
      .mockResolvedValue([
        { ...makeComment('my note'), status: 'done' as const, resolution: 'Done deal.' },
      ]);
    annotator = new Annotator({
      config: { project: PROJECT, source },
      reviewer: REVIEWER,
      mode: 'reviewer',
      storage: localStorage,
    });
    await flushMicrotasks();

    const ta = openFirstPinInput();
    expect(ta.readOnly).toBe(true);
    ta.value = 'defacing the record'; // programmatic — readOnly only blocks typing
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true }));

    const c = loadStore(localStorage, PROJECT, REVIEWER)?.comments[0];
    expect(c).toMatchObject({ text: 'my note', status: 'done', resolution: 'Done deal.' });
  });

  it('empty-cleanup never deletes a resolved comment', () => {
    seedMany([{ ...makeComment(''), status: 'declined', resolution: 'Duplicate.' }]);
    annotator = makeAnnotator();

    const ta = openFirstPinInput();
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(shadow().querySelector('.input')).toBeNull();
    expect(loadStore(localStorage, PROJECT, REVIEWER)?.comments).toHaveLength(1);
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

describe('pin accessibility (production audit)', () => {
  let annotator: Annotator | null = null;

  afterEach(() => {
    annotator?.destroy();
    annotator = null;
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('pins are real buttons with accessible names — keyboard operable by construction', () => {
    seedStore(makeComment('needs a11y'));
    annotator = makeAnnotator();
    const pin = shadow().querySelector('.pin');
    expect(pin?.tagName).toBe('BUTTON');
    expect((pin as HTMLButtonElement).type).toBe('button');
    expect(pin?.getAttribute('aria-label')).toBeTruthy();
    // Enter/Space on a button dispatch click natively; the same handler path
    // a pointer takes. Assert the click path opens the editor.
    (pin as HTMLButtonElement).click();
    expect(shadow().querySelector('.input textarea')).not.toBeNull();
  });
});

describe('source hydration boundary (codex audit #18)', () => {
  let annotator: Annotator | null = null;

  afterEach(() => {
    annotator?.destroy();
    annotator = null;
    localStorage.clear();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('a synchronously-throwing source is contained after UI install', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    seedStore(makeComment('mine'));
    annotator = new Annotator({
      config: {
        project: PROJECT,
        source: () => {
          throw new Error('sync boom');
        },
      },
      reviewer: REVIEWER,
      mode: 'reviewer',
      storage: localStorage,
    });
    expect(shadow().querySelectorAll('.pin')).toHaveLength(1); // UI intact
    expect(warn).toHaveBeenCalled();
  });

  it('a non-array resolution is treated as empty, not a crash', async () => {
    seedStore(makeComment('mine'));
    annotator = new Annotator({
      config: {
        project: PROJECT,
        source: () => Promise.resolve({ nope: true } as unknown as Comment[]),
      },
      reviewer: REVIEWER,
      mode: 'reviewer',
      storage: localStorage,
    });
    await flushMicrotasks();
    expect(loadStore(localStorage, PROJECT, REVIEWER)?.comments[0]?.text).toBe('mine');
    expect(shadow().querySelectorAll('.pin')).toHaveLength(1);
  });

  it('malformed server entries are dropped by normalization before merge', async () => {
    seedStore(makeComment('mine'));
    annotator = new Annotator({
      config: {
        project: PROJECT,
        source: () =>
          Promise.resolve([
            { id: 'bad', anchor: null } as unknown as Comment,
            { ...makeComment('ok'), id: 'c_good' },
          ]),
      },
      reviewer: REVIEWER,
      mode: 'reviewer',
      storage: localStorage,
    });
    await flushMicrotasks();
    const ids = loadStore(localStorage, PROJECT, REVIEWER)?.comments.map((c) => c.id) ?? [];
    expect(ids.sort()).toEqual(['c1', 'c_good'].sort());
  });
});

describe('builder mode is functional (codex audit #14)', () => {
  let annotator: Annotator | null = null;

  afterEach(() => {
    annotator?.destroy();
    annotator = null;
    localStorage.clear();
    document.body.innerHTML = '';
  });

  function seedTwoReviewers(): void {
    saveStore(localStorage, {
      ...emptyStore(PROJECT, 'Alice'),
      comments: [{ ...makeComment('from alice'), id: 'a1' }],
    });
    saveStore(localStorage, {
      ...emptyStore(PROJECT, 'Bob'),
      comments: [{ ...makeComment('from bob'), id: 'b1', status: 'done' as const }],
    });
  }

  function makeBuilder(): Annotator {
    return new Annotator({
      config: { project: PROJECT },
      reviewer: 'Builder',
      mode: 'builder',
      storage: localStorage,
    });
  }

  it('reviewer checkboxes actually filter pins', () => {
    seedTwoReviewers();
    annotator = makeBuilder();
    expect(shadow().querySelectorAll('.pin')).toHaveLength(2);

    shadow().querySelector<HTMLButtonElement>('button.control')!.click(); // open drawer
    const alice = shadow().querySelector<HTMLInputElement>('input[data-reviewer="Alice"]')!;
    alice.checked = false;
    alice.dispatchEvent(new Event('change'));
    expect(shadow().querySelectorAll('.pin')).toHaveLength(1);

    alice.checked = true;
    alice.dispatchEvent(new Event('change'));
    expect(shadow().querySelectorAll('.pin')).toHaveLength(2);
  });

  it('a builder pin opens a read-only view with attribution and disposition', () => {
    seedTwoReviewers();
    annotator = makeBuilder();
    const pins = Array.from(shadow().querySelectorAll<HTMLButtonElement>('.pin'));
    pins[0]!.click();
    const ta = shadow().querySelector<HTMLTextAreaElement>('.input textarea');
    expect(ta).not.toBeNull();
    expect(ta!.readOnly).toBe(true);
    const res = shadow().querySelector('.input .res')?.textContent ?? '';
    expect(res === 'Alice' || res.startsWith('Bob')).toBe(true);
    // Escape closes; nothing was mutated anywhere.
    ta!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(shadow().querySelector('.input')).toBeNull();
    expect(loadStore(localStorage, PROJECT, 'Alice')?.comments[0]?.text).toBe('from alice');
    expect(loadStore(localStorage, PROJECT, 'Bob')?.comments[0]?.text).toBe('from bob');
  });
});

describe('voice transcript survives destroy during in-flight stop (codex audit #5)', () => {
  afterEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('a commit landing AFTER destroy() persists storage-only (no DOM, no loss)', async () => {
    let capturedHost: VoiceHost | null = null;
    const loadVoice = (): Promise<VoiceModule> =>
      Promise.resolve({
        start: (host: VoiceHost) => {
          capturedHost = host;
          return Promise.resolve({ stop: () => Promise.resolve(), dispose: () => {} });
        },
      });
    const annotator = makeAnnotator({ voice: true, loadVoice });
    (
      annotator as unknown as { _placeCommentAt(x: number, y: number, t: Element): void }
    )._placeCommentAt(10, 10, document.body);
    await flushMicrotasks();
    expect(capturedHost).not.toBeNull();

    annotator.destroy(); // world torn down while the recording finalizes

    capturedHost!.commit({ text: 'words that must survive', voice: { durationMs: 1200 } });
    const stored = loadStore(localStorage, PROJECT, REVIEWER);
    expect(stored?.comments.some((c) => c.text === 'words that must survive')).toBe(true);
    // And absolutely no DOM resurrection:
    expect(document.querySelector('[data-pinflow-root]')).toBeNull();
  });
});

it('#32 (r2): the voice DEGRADE path keeps the frozen fullUrl, not the navigated one', async () => {
  let capturedHost: VoiceHost | null = null;
  const loadVoice = (): Promise<VoiceModule> =>
    Promise.resolve({
      start: (host: VoiceHost) => {
        capturedHost = host;
        return Promise.resolve({ stop: () => Promise.resolve(), dispose: () => {} });
      },
    });
  const annotator = makeAnnotator({ voice: true, loadVoice });
  const frozenUrl = window.location.href;
  (
    annotator as unknown as { _placeCommentAt(x: number, y: number, t: Element): void }
  )._placeCommentAt(10, 10, document.body);
  await flushMicrotasks();
  history.pushState({}, '', '/navigated-away');
  capturedHost!.degradeToText();
  const stored = loadStore(localStorage, PROJECT, REVIEWER);
  const voiceComment = stored?.comments[stored.comments.length - 1];
  expect(voiceComment?.fullUrl).toBe(frozenUrl);
  history.pushState({}, '', frozenUrl);
  annotator.destroy();
  localStorage.clear();
  document.body.innerHTML = '';
});
