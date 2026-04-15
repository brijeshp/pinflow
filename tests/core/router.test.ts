import { describe, expect, it, vi } from 'vitest';
import { routeOf, watchRoute } from '../../src/core/router';

describe('router', () => {
  it('routeOf extracts pathname + search', () => {
    expect(routeOf('http://x/pricing?q=1')).toBe('/pricing?q=1');
    expect(routeOf('bad url')).toBe('/');
  });

  it('watchRoute fires on pushState', async () => {
    const cb = vi.fn();
    const w = watchRoute(cb);
    history.pushState({}, '', '/new-route');
    await Promise.resolve();
    expect(cb).toHaveBeenCalledWith('/new-route');
    w.stop();
  });

  it('stop restores history methods', () => {
    const before = history.pushState;
    const w = watchRoute(() => {});
    expect(history.pushState).not.toBe(before);
    w.stop();
    expect(history.pushState).toBe(before);
  });
});
