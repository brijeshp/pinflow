import { beforeEach, describe, expect, it } from 'vitest';
import {
  anonymousHandle,
  isAnonymous,
  modeFromUrl,
  resolveReviewer,
  reviewerFromUrl,
} from '../../src/core/identity';

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

  it('mints an anonymous handle when nothing else identifies the reviewer', () => {
    const name = resolveReviewer({
      url: 'http://x/',
      storage: localStorage,
      project: 'p',
      mint: anonymousHandle,
    });
    expect(name).not.toBeNull();
    expect(isAnonymous(name as string)).toBe(true);
    // Remembered, so the same browser is the same reviewer on the next visit.
    expect(localStorage.getItem('pinflow:r:p')).toBe(name);
  });

  it('reuses the remembered handle rather than minting a second one', () => {
    const deps = { url: 'http://x/', storage: localStorage, project: 'p', mint: anonymousHandle };
    expect(resolveReviewer(deps)).toBe(resolveReviewer(deps));
  });

  // Stealth must stay invisible at host startup — including in localStorage.
  // Without a mint, identity stays unresolved until the first activation.
  it('returns null when no mint is offered', () => {
    expect(resolveReviewer({ url: 'http://x/', storage: localStorage, project: 'p' })).toBeNull();
    expect(localStorage.getItem('pinflow:r:p')).toBeNull();
  });

  it('a real name is never mistaken for an anonymous handle', () => {
    expect(isAnonymous('Brijesh')).toBe(false);
    expect(isAnonymous('')).toBe(false);
    expect(isAnonymous('__builder__')).toBe(false);
  });

  it('mints distinct handles', () => {
    expect(anonymousHandle()).not.toBe(anonymousHandle());
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
    // A handle that cannot be remembered is still a usable handle for this
    // session — the corpus just won't survive the reload.
    const minted = resolveReviewer({
      url: 'http://x/',
      storage: throwing,
      project: 'p',
      mint: anonymousHandle,
    });
    expect(isAnonymous(minted as string)).toBe(true);
  });
});
