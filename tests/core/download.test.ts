import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyToClipboard, downloadMarkdown } from '../../src/core/download';

describe('downloadMarkdown', () => {
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
    vi.spyOn(document.body, 'appendChild').mockImplementation((n) => n);
    vi.spyOn(document.body, 'removeChild').mockImplementation((n) => n);

    downloadMarkdown('# Hello', 'test.md');
    expect(createUrl).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
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

  it('falls back to execCommand when clipboard API fails', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('denied')) },
      configurable: true,
    });
    (document as unknown as Record<string, unknown>).execCommand = vi.fn().mockReturnValue(true);
    const ok = await copyToClipboard('fallback');
    expect(ok).toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith('copy');
    delete (document as unknown as Record<string, unknown>).execCommand;
  });

  it('returns false when all methods fail', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('no')) },
      configurable: true,
    });
    (document as unknown as Record<string, unknown>).execCommand = vi
      .fn()
      .mockImplementation(() => {
        throw new Error('nope');
      });
    const ok = await copyToClipboard('nope');
    expect(ok).toBe(false);
    delete (document as unknown as Record<string, unknown>).execCommand;
  });
});
