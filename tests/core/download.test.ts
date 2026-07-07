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
    vi.spyOn(document.body, 'appendChild').mockImplementation((n) => n);
    vi.spyOn(document.body, 'removeChild').mockImplementation((n) => n);

    download('# Hello', 'test.md');
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
});
