import { afterEach, describe, expect, it, vi } from 'vitest';

describe('init / destroy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('returns a handle with destroy', async () => {
    const { init } = await import('../../src/core/index');
    localStorage.setItem('pinflow:reviewer:test', 'Tester');
    const handle = init({ project: 'test' });
    expect(handle).toHaveProperty('destroy');
    expect(typeof handle.destroy).toBe('function');
    handle.destroy();
  });

  it('re-init destroys previous instance', async () => {
    const { init } = await import('../../src/core/index');
    localStorage.setItem('pinflow:reviewer:test', 'Tester');
    const h1 = init({ project: 'test' });
    const spy = vi.spyOn(h1, 'destroy');
    init({ project: 'test' });
    expect(spy).toHaveBeenCalled();
  });

  it('destroy is safe to call multiple times', async () => {
    const { init } = await import('../../src/core/index');
    localStorage.setItem('pinflow:reviewer:test', 'Tester');
    const handle = init({ project: 'test' });
    handle.destroy();
    expect(() => handle.destroy()).not.toThrow();
  });

  it('returns noop handle when reviewer cannot be resolved and mode is reviewer', async () => {
    const { init } = await import('../../src/core/index');
    vi.spyOn(window, 'prompt').mockReturnValue(null);
    const handle = init({ project: 'orphan' });
    expect(handle).toHaveProperty('destroy');
    handle.destroy();
  });

  it('builder mode works without reviewer prompt', async () => {
    const { init } = await import('../../src/core/index');
    const handle = init({ project: 'bld', mode: 'builder' });
    expect(handle).toHaveProperty('destroy');
    handle.destroy();
  });

  it('exports routeOf', async () => {
    const { routeOf } = await import('../../src/core/index');
    expect(routeOf('http://x/pricing?q=1')).toBe('/pricing?q=1');
  });
});
