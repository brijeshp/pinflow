import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyToClipboard, download } from '../../src/core/download';

describe('download', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('creates a blob link, clicks it, and cleans up', () => {
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    const clickSpy = vi.fn();
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        const a = {
          href: '',
          download: '',
          rel: '',
          click: clickSpy,
        } as unknown as HTMLAnchorElement;
        return a;
      }
      return document.createElement(tag);
    });
    const append = vi.spyOn(document.body, 'appendChild').mockImplementation((n) => n);

    download('# Hello', 'test.md');
    expect(createUrl).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeUrl).not.toHaveBeenCalled(); // deferred revoke
    // The anchor must stay DETACHED: an attached anchor's synthetic click
    // propagates through document and the ARMED annotate handler would treat
    // it as a page click — placing a bogus pin and closing the export panel.
    expect(append).not.toHaveBeenCalled();
  });

  it('a download during armed annotate mode never reaches document listeners', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const seen = vi.fn();
    document.addEventListener('click', seen, true);
    try {
      download('# Hello', 'test.md');
      expect(seen).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('click', seen, true);
    }
  });
});

describe('copyToClipboard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses navigator.clipboard when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const ok = await copyToClipboard('hello');
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('returns false (never throws) when the clipboard API rejects', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('denied')) },
      configurable: true,
    });
    await expect(copyToClipboard('nope')).resolves.toBe(false);
  });

  it('returns false when the clipboard API is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    });
    await expect(copyToClipboard('nope')).resolves.toBe(false);
  });

  it('initiates the native write synchronously, inside the caller gesture', async () => {
    // WebKit rejects clipboard writes that begin behind an async boundary —
    // the user activation is gone by then. The coordinator must call
    // writeText on the SAME tick as copyToClipboard (0.10.0 review #12).
    let calledSynchronously = false;
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: () => {
          calledSynchronously = true;
          return Promise.resolve();
        },
      },
      configurable: true,
    });
    const p = copyToClipboard('gesture');
    expect(calledSynchronously).toBe(true);
    await expect(p).resolves.toBe(true);
  });

  it('a write pending past the settle bound stops being shareable — fail fast, never wedge', async () => {
    // ELAPSED time, not timer execution: a backgrounded page can suspend
    // timers past the wall-clock bound, so the expiry is checked
    // synchronously at share time (0.10.0 review #13). The clock is mocked so
    // no timer callback ever runs between the calls.
    let t = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => t);
    let settle!: () => void;
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => new Promise<void>((r) => (settle = r)) },
      configurable: true,
    });
    const hung = copyToClipboard('same artifact');
    // Same content while healthy: shared, no second native write.
    t = 100;
    const shared = copyToClipboard('same artifact');
    expect(shared).toBe(hung);
    // Past the bound — with NO timer having fired — even same-content callers
    // are refused instead of joining a write the engine may never settle.
    t = 3001;
    await expect(copyToClipboard('same artifact')).resolves.toBe(false);
    // Different content is refused throughout — never reordered.
    await expect(copyToClipboard('other artifact')).resolves.toBe(false);
    // A late settle drains the slot; the page recovers without reload.
    settle();
    await expect(hung).resolves.toBe(true);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.resolve() },
      configurable: true,
    });
    await expect(copyToClipboard('fresh')).resolves.toBe(true);
  });

  it('system sleep expires the slot even while the monotonic clock is frozen', async () => {
    // WebKit's performance.now() does not advance through system sleep — the
    // wall clock is the second bound, expiring the share on EITHER elapsed
    // value (0.10.0 review #14).
    vi.spyOn(performance, 'now').mockImplementation(() => 0); // frozen through sleep
    let wall = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => wall);
    let settle!: () => void;
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => new Promise<void>((r) => (settle = r)) },
      configurable: true,
    });
    const hung = copyToClipboard('same artifact');
    wall += 3001; // the Mac slept past the bound; performance.now() saw nothing
    await expect(copyToClipboard('same artifact')).resolves.toBe(false);
    settle();
    await expect(hung).resolves.toBe(true);
  });
});
