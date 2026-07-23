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

it('#25: the public routeOf strips pinflow params exactly like the default routeKey', async () => {
  const { routeOf } = await import('../../src/core/index');
  expect(routeOf('https://x.test/a/b?reviewer=Sam&mode=builder&keep=1')).toBe('/a/b?keep=1');
  expect(routeOf('https://x.test/a/b?reviewer=Sam')).toBe('/a/b');
});
