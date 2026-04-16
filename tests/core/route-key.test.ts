import { describe, expect, it } from 'vitest';
import { routeKey } from '../../src/core/route-key';

describe('routeKey', () => {
  it('strips reviewer and mode params', () => {
    expect(routeKey('http://x/pricing?reviewer=Alice&mode=builder')).toBe('/pricing');
  });

  it('preserves non-pinflow params', () => {
    expect(routeKey('http://x/search?q=hello&reviewer=Bob')).toBe('/search?q=hello');
  });

  it('returns just pathname when no query', () => {
    expect(routeKey('http://x/about')).toBe('/about');
  });

  it('returns / for invalid urls', () => {
    expect(routeKey('not a url')).toBe('/');
  });
});
