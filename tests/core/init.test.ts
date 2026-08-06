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
  // Release-time activation (0.5.0): the point pin lands on pointerup so an
  // Alt+drag can become an area instead.
  for (const type of ['pointerdown', 'pointerup'] as const) {
    const e = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(e, {
      pointerId: 1,
      pointerType: 'mouse',
      altKey: true,
      clientX: 12,
      clientY: 12,
    });
    target.dispatchEvent(e);
  }
  // The gesture controller swallows exactly one trailing click after an
  // activation; consume it so later .click() calls reach their targets.
  document.body.dispatchEvent(new Event('click', { bubbles: true }));
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

  it('noop handle carries the full export API returning empty artifacts', async () => {
    const { init } = await import('../../src/core/index');
    vi.spyOn(window, 'prompt').mockReturnValue(null);
    const handle = init({ project: 'orphan' });
    expect(handle.exportMarkdown()).toBe('');
    expect(handle.exportJSON()).toBe('');
    expect(() => handle.downloadExport()).not.toThrow(); // typed void; inert
    handle.destroy();
  });

  it('live handle exposes exportMarkdown/exportJSON for the current reviewer', async () => {
    const { init } = await import('../../src/core/index');
    localStorage.setItem('pinflow:r:hnd', 'Hana');
    const handle = init({ project: 'hnd' });
    expect(handle.exportMarkdown()).toContain('# Feedback for hnd — from Hana');
    expect(JSON.parse(handle.exportJSON()).pinflowExport).toBe(3);
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

      // Save text after each activation — switching away from an unsaved
      // EMPTY popup discards that comment by design (explicit-save semantics).
      const saveWith = (text: string): void => {
        const sh = document.querySelector('[data-pinflow-root]')?.shadowRoot;
        const ta = sh?.querySelector('textarea');
        if (!ta) throw new Error('input did not open');
        ta.value = text;
        sh?.querySelector<HTMLButtonElement>('button.save')?.click();
      };

      altClick(document.body);
      expect(prompt).toHaveBeenCalledTimes(1);
      saveWith('first');

      altClick(document.body);
      expect(prompt).toHaveBeenCalledTimes(1); // identity is sticky
      saveWith('second');

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
        expect(root?.shadowRoot?.querySelector('.arm')).not.toBeNull();
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

describe('fail-loud boot (first-user feedback: silent failure cost a 30-minute debug)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setUrl(ORIGINAL_URL);
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('announces readiness with exactly one console.info line: version, mode, activation, count', async () => {
    const { init } = await import('../../src/core/index');
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    localStorage.setItem('pinflow:r:boot', 'Tester');
    const handle = init({ project: 'boot' });
    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith(
      expect.stringMatching(/^\[pinflow\] v.+ ready — mode=reviewer, activation=both, 0 comments$/),
    );
    handle.destroy();
  });

  it("Alt+click works with ZERO activation config — the default is 'both' (first-user feedback: the obvious power move must not feel broken)", async () => {
    const { init } = await import('../../src/core/index');
    vi.spyOn(console, 'info').mockImplementation(() => {});
    localStorage.setItem('pinflow:r:defboth', 'Tester');
    const target = document.createElement('p');
    target.textContent = 'host content';
    document.body.appendChild(target);
    const handle = init({ project: 'defboth' });
    altClick(target);
    const root = document.querySelector('[data-pinflow-root]');
    expect(root?.shadowRoot?.querySelector('textarea')).not.toBeNull();
    handle.destroy();
  });

  it("explicit activation 'toggle' still opts out of the gesture", async () => {
    const { init } = await import('../../src/core/index');
    vi.spyOn(console, 'info').mockImplementation(() => {});
    localStorage.setItem('pinflow:r:opttoggle', 'Tester');
    const target = document.createElement('p');
    document.body.appendChild(target);
    const handle = init({ project: 'opttoggle', activation: { mode: 'toggle' } });
    altClick(target);
    const root = document.querySelector('[data-pinflow-root]');
    expect(root?.shadowRoot?.querySelector('textarea')).toBeNull();
    handle.destroy();
  });

  it('reports the persisted comment count, not zero, when a corpus exists', async () => {
    const { init } = await import('../../src/core/index');
    const { emptyStore, saveStore } = await import('../../src/core/storage');
    const { acquireStorage } = await import('../../src/core/safe-storage');
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    localStorage.setItem('pinflow:r:boot2', 'Tester');
    const store = emptyStore('boot2', 'Tester');
    const anchor = {
      selectors: { testid: null, id: null, css: 'p', xpath: '/html/body/p[1]' },
      textFingerprint: 'x',
      positionPercent: { x: 10, y: 10 },
      viewport: { width: 800, height: 600 },
    };
    store.comments.push(
      {
        id: 'c1',
        createdAt: 'x',
        updatedAt: 'x',
        route: '/',
        fullUrl: 'u',
        text: 'a',
        anchor,
        modality: 'text',
      },
      {
        id: 'c2',
        createdAt: 'x',
        updatedAt: 'x',
        route: '/',
        fullUrl: 'u',
        text: 'b',
        anchor,
        modality: 'text',
      },
    );
    saveStore(acquireStorage(), store);
    const handle = init({ project: 'boot2' });
    expect(info).toHaveBeenCalledWith(expect.stringMatching(/2 comments$/));
    handle.destroy();
  });

  it('prints nothing on the inert path — declined identity yields no ready line', async () => {
    const { init } = await import('../../src/core/index');
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(window, 'prompt').mockReturnValue(null);
    const handle = init({ project: 'boot3' });
    expect(info).not.toHaveBeenCalled();
    handle.destroy();
  });

  it('surfaces init failure via console.error before rethrowing (host may swallow the throw)', async () => {
    const { init } = await import('../../src/core/index');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    setUrl('https://example.com/page');
    expect(() =>
      init({ project: 'boot4', reviewer: 'Sam', voice: { devOnlyToken: 'tok' } }),
    ).toThrow(/devOnlyToken/);
    expect(error).toHaveBeenCalledWith('[pinflow] init failed:', expect.any(Error));
  });
});

describe('public artifact toolkit (L3 API polish)', () => {
  it('re-exports the DOM-free export helpers from the package entry', async () => {
    const mod = await import('../../src/core/index');
    expect(typeof mod.exportReviewer).toBe('function');
    expect(typeof mod.exportBuilder).toBe('function');
    expect(typeof mod.exportFilename).toBe('function');
    expect(typeof mod.exportJSON).toBe('function');
  });
});
