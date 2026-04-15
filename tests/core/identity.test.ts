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
    localStorage.setItem('pinflow:reviewer:p', 'Old');
    const name = resolveReviewer({ url: 'http://x/?reviewer=New', storage: localStorage, project: 'p' });
    expect(name).toBe('New');
    expect(localStorage.getItem('pinflow:reviewer:p')).toBe('New');
  });

  it('storage wins when URL absent', () => {
    localStorage.setItem('pinflow:reviewer:p', 'Mike');
    expect(resolveReviewer({ url: 'http://x/', storage: localStorage, project: 'p' })).toBe('Mike');
  });

  it('falls back to prompt', () => {
    const prompt = vi.fn().mockReturnValue('Jen');
    const name = resolveReviewer({ url: 'http://x/', storage: localStorage, project: 'p', prompt });
    expect(name).toBe('Jen');
    expect(localStorage.getItem('pinflow:reviewer:p')).toBe('Jen');
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
});
