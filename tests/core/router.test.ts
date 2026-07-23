import { describe, expect, it, vi } from 'vitest';
import { watchRoute } from '../../src/core/router';
import { routeKey as routeOf } from '../../src/core/route-key';

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

  it('stop leaves a later third-party wrapper intact and goes dead (P4.6)', async () => {
    const original = history.pushState;
    const cb = vi.fn();
    const w = watchRoute(cb);
    // A router library wraps history AFTER us — a naive restore would rip
    // its wrapper out of the chain.
    const ours = history.pushState;
    const third = function (this: History, ...args: Parameters<History['pushState']>) {
      return ours.apply(this, args);
    };
    history.pushState = third;
    try {
      w.stop();
      expect(history.pushState).toBe(third); // not clobbered

      // Our orphaned wrapper is still in the chain but must never emit.
      history.pushState({}, '', '/after-stop');
      await Promise.resolve();
      expect(cb).not.toHaveBeenCalledWith('/after-stop');
    } finally {
      history.pushState = original;
      history.pushState({}, '', '/');
    }
  });
});
