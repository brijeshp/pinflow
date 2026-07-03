import { afterEach, describe, expect, it, vi } from 'vitest';

// happy-dom exposes a detached API for changing the window URL (origin
// included, which history.pushState cannot do).
function setUrl(url: string): void {
  const w = window as unknown as { happyDOM?: { setURL?: (u: string) => void } };
  if (w.happyDOM?.setURL) w.happyDOM.setURL(url);
  else window.location.href = url;
}

// Synthesize the desktop Alt+click stealth gesture (happy-dom has no
// PointerEvent constructor — same pattern as gesture.test.ts).
function altClick(target: EventTarget): void {
  const e = new Event('pointerdown', { bubbles: true, cancelable: true });
  Object.assign(e, { pointerId: 1, pointerType: 'mouse', altKey: true, clientX: 12, clientY: 12 });
  target.dispatchEvent(e);
}

const ORIGINAL_URL = window.location.href;

describe('init / destroy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setUrl(ORIGINAL_URL);
    localStorage.clear();
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

  it('re-init destroys previous instance and warns about the double-init (P4.5)', async () => {
    const { init } = await import('../../src/core/index');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem('pinflow:r:test', 'Tester');
    const h1 = init({ project: 'test' });
    const spy = vi.spyOn(h1, 'destroy');
    const h2 = init({ project: 'test' });
    expect(spy).toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('another instance is active'));
    h2.destroy();
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

  describe('devOnlyToken origin guardrail (P4.2)', () => {
    it('throws at init when voice.devOnlyToken is set on a non-local origin', async () => {
      const { init } = await import('../../src/core/index');
      setUrl('https://demo.example.com/');
      expect(() =>
        init({ project: 'p', reviewer: 'Sam', voice: { devOnlyToken: 'dev-jwt' } }),
      ).toThrow('local origin');
    });

    it('does not throw on localhost', async () => {
      const { init } = await import('../../src/core/index');
      const handle = init({ project: 'p', reviewer: 'Sam', voice: { devOnlyToken: 'dev-jwt' } });
      expect(handle).toHaveProperty('destroy');
      handle.destroy();
    });
  });

  describe('stealth identity deferral (P4.3)', () => {
    it('stealth init never prompts, yet still mounts the layer', async () => {
      const { init } = await import('../../src/core/index');
      const prompt = vi.spyOn(window, 'prompt').mockReturnValue('ShouldNotBeAsked');
      const handle = init({ project: 'st', activation: { mode: 'stealth' } });
      expect(prompt).not.toHaveBeenCalled();
      expect(document.querySelector('[data-pinflow-root]')).not.toBeNull();
      handle.destroy();
    });

    it('first activation prompts exactly once; later activations reuse the identity', async () => {
      const { init } = await import('../../src/core/index');
      const prompt = vi.spyOn(window, 'prompt').mockReturnValue('Stealthy');
      const handle = init({ project: 'st', activation: { mode: 'stealth' } });
      expect(prompt).not.toHaveBeenCalled();

      altClick(document.body);
      expect(prompt).toHaveBeenCalledTimes(1);

      altClick(document.body);
      expect(prompt).toHaveBeenCalledTimes(1); // identity is sticky

      const raw = localStorage.getItem('pinflow:c:st:Stealthy');
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw as string).comments).toHaveLength(2);
      handle.destroy();
    });

    it('declining the prompt drops the activation; the next one asks again', async () => {
      const { init } = await import('../../src/core/index');
      const prompt = vi.spyOn(window, 'prompt').mockReturnValue(null);
      const handle = init({ project: 'st', activation: { mode: 'stealth' } });

      altClick(document.body);
      altClick(document.body);
      expect(prompt).toHaveBeenCalledTimes(2);
      expect(localStorage.getItem('pinflow:c:st:null')).toBeNull();
      handle.destroy();
    });

    it('URL-param identity resolves eagerly in stealth without any prompt', async () => {
      const { init } = await import('../../src/core/index');
      setUrl(`${ORIGINAL_URL.replace(/\?.*$/, '')}?reviewer=Zoe`);
      const prompt = vi.spyOn(window, 'prompt').mockReturnValue('ShouldNotBeAsked');
      const handle = init({ project: 'st', activation: { mode: 'stealth' } });

      altClick(document.body);
      expect(prompt).not.toHaveBeenCalled();
      const raw = localStorage.getItem('pinflow:c:st:Zoe');
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw as string).comments).toHaveLength(1);
      handle.destroy();
    });
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
