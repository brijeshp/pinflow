import { beforeEach, describe, expect, it, vi } from 'vitest';
import { modeFromUrl, resolveReviewer, reviewerFromUrl } from '../../src/core/identity';

describe('identity', () => {
  beforeEach(() => localStorage.clear());

  it('parses reviewer from URL', () => {
    expect(reviewerFromUrl('http://x/?reviewer=Sarah')).toBe('Sarah');
    expect(reviewerFromUrl('http://x/?reviewer=')).toBeNull();
    expect(reviewerFromUrl('http://x/')).toBeNull();
    expect(reviewerFromUrl('not a url')).toBeNull();
  });

  it('URL wins over storage', () => {
    localStorage.setItem('pinflow:r:p', 'Old');
    const name = resolveReviewer({
      url: 'http://x/?reviewer=New',
      storage: localStorage,
      project: 'p',
    });
    expect(name).toBe('New');
    expect(localStorage.getItem('pinflow:r:p')).toBe('New');
  });

  it('storage wins when URL absent', () => {
    localStorage.setItem('pinflow:r:p', 'Mike');
    expect(resolveReviewer({ url: 'http://x/', storage: localStorage, project: 'p' })).toBe('Mike');
  });

  it('falls back to prompt', () => {
    const prompt = vi.fn().mockReturnValue('Jen');
    const name = resolveReviewer({ url: 'http://x/', storage: localStorage, project: 'p', prompt });
    expect(name).toBe('Jen');
    expect(localStorage.getItem('pinflow:r:p')).toBe('Jen');
  });

  it('returns null when prompt cancelled and nothing cached', () => {
    const prompt = vi.fn().mockReturnValue(null);
    expect(
      resolveReviewer({ url: 'http://x/', storage: localStorage, project: 'p', prompt }),
    ).toBeNull();
  });

  it('parses mode from URL', () => {
    expect(modeFromUrl('http://x/?mode=builder')).toBe('builder');
    expect(modeFromUrl('http://x/?mode=reviewer')).toBe('reviewer');
    expect(modeFromUrl('http://x/?mode=other')).toBeNull();
    expect(modeFromUrl('http://x/')).toBeNull();
  });

  it('survives a storage whose setItem throws (P0.3)', () => {
    const throwing: Storage = {
      length: 0,
      clear() {},
      getItem: () => null,
      key: () => null,
      removeItem() {},
      setItem() {
        throw new DOMException('quota', 'QuotaExceededError');
      },
    };
    expect(
      resolveReviewer({ url: 'http://x/?reviewer=Ann', storage: throwing, project: 'p' }),
    ).toBe('Ann');
    const prompt = vi.fn().mockReturnValue('Jen');
    expect(resolveReviewer({ url: 'http://x/', storage: throwing, project: 'p', prompt })).toBe(
      'Jen',
    );
  });
});

// Sandboxed iframes without `allow-modals` — Lovable, Bolt, StackBlitz and
// CodeSandbox previews, i.e. where vibe-coded prototypes actually live — make
// window.prompt THROW rather than return null. That exception propagated out
// of resolveReviewer and out of init(), so pinflow failed to mount at all in
// its primary deployment environment. A blocked prompt is an unanswered
// prompt: degrade to no identity, exactly like a cancelled one.
describe('a prompt the environment refuses to show', () => {
  it('degrades to null instead of throwing', () => {
    const prompt = vi.fn(() => {
      throw new Error('prompt() is not supported.');
    });
    expect(() =>
      resolveReviewer({ url: 'http://x/', storage: localStorage, project: 'p', prompt }),
    ).not.toThrow();
    expect(
      resolveReviewer({ url: 'http://x/', storage: localStorage, project: 'p', prompt }),
    ).toBeNull();
  });
});
