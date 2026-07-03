import { afterEach, describe, expect, it, vi } from 'vitest';

describe('init / destroy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('returns a handle with destroy', async () => {
    const { init } = await import('../../src/core/index');
    localStorage.setItem('pinflow:r:test', 'Tester');
    const handle = init({ project: 'test' });
    expect(handle).toHaveProperty('destroy');
    expect(typeof handle.destroy).toBe('function');
    handle.destroy();
  });

  it('re-init destroys previous instance', async () => {
    const { init } = await import('../../src/core/index');
    localStorage.setItem('pinflow:r:test', 'Tester');
    const h1 = init({ project: 'test' });
    const spy = vi.spyOn(h1, 'destroy');
    init({ project: 'test' });
    expect(spy).toHaveBeenCalled();
  });

  it('destroy is safe to call multiple times', async () => {
    const { init } = await import('../../src/core/index');
    localStorage.setItem('pinflow:r:test', 'Tester');
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

  describe('blocked storage (P0.3)', () => {
    function blockLocalStorage(): () => void {
      const desc = Object.getOwnPropertyDescriptor(window, 'localStorage');
      if (!desc) throw new Error('localStorage descriptor missing');
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('The operation is insecure.', 'SecurityError');
        },
      });
      return () => Object.defineProperty(window, 'localStorage', desc);
    }

    it('init succeeds and renders a working widget when the localStorage getter throws', async () => {
      const { init } = await import('../../src/core/index');
      const restore = blockLocalStorage();
      try {
        const handle = init({ project: 'blocked', reviewer: 'Sam' });
        const root = document.querySelector('[data-pinflow-root]');
        expect(root).not.toBeNull();
        expect(root?.shadowRoot?.querySelector('.control')).not.toBeNull();
        expect(() => handle.destroy()).not.toThrow();
      } finally {
        restore();
      }
    });

    it('identity resolution still works non-persistently when storage is blocked', async () => {
      const { init } = await import('../../src/core/index');
      vi.spyOn(window, 'prompt').mockReturnValue('Ann');
      const restore = blockLocalStorage();
      try {
        // Prompt path forces the identity setItem write onto the fallback shim.
        const handle = init({ project: 'blocked2' });
        const root = document.querySelector('[data-pinflow-root]');
        expect(root).not.toBeNull();
        handle.destroy();
      } finally {
        restore();
      }
    });
  });
});
